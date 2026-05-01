const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const ApprovedVoter = require('../models/ApprovedVoter');
const User = require('../models/User');
const { sendEmail } = require('../utils/mailer');
const { generateOtp, hashOtp } = require('../utils/otp');
const {
  sanitizeString,
  sanitizeEmail,
  sanitizeStudentId,
  isValidEmail,
  isStrongPassword,
  isValidName
} = require('../utils/sanitize');

const LOGIN_OTP_TTL_MS = 5 * 60 * 1000;
const RESET_OTP_TTL_MS = 10 * 60 * 1000;
const OTP_REQUEST_COOLDOWN_MS = 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const GENERIC_PASSWORD_RESET_MESSAGE =
  'If an active voter account exists for that email, a password reset OTP has been sent.';
const GENERIC_LOGIN_OTP_MESSAGE =
  'If an active voter account exists for that email, a login OTP has been sent.';

const createAuthToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: '1d'
  });

const createRegistrationToken = ({ email, studentId }) =>
  jwt.sign({ email, studentId, purpose: 'register' }, process.env.JWT_SECRET, {
    expiresIn: '10m'
  });

const createPasswordResetToken = (user) =>
  jwt.sign({ id: user._id, email: user.email, purpose: 'password-reset' }, process.env.JWT_SECRET, {
    expiresIn: '10m'
  });

const buildAuthUserPayload = (user) => ({
  id: user._id,
  name: user.name,
  email: user.email,
  studentId: user.studentId,
  role: user.role,
  hasVoted: user.hasVoted
});

const isValidOtp = (value = '') => /^\d{6}$/.test(String(value).trim());

const clearApprovedVoterOtp = (approvedVoter) => {
  approvedVoter.otpHash = undefined;
  approvedVoter.otpExpiresAt = undefined;
  approvedVoter.otpAttempts = 0;
  approvedVoter.otpVerifiedAt = undefined;
};

const ensureUserOtpState = (user, key) => {
  if (!user[key]) {
    user[key] = {};
  }

  if (typeof user[key].attempts !== 'number') {
    user[key].attempts = 0;
  }

  return user[key];
};

const clearUserOtpState = (user, key) => {
  const otpState = ensureUserOtpState(user, key);
  otpState.hash = undefined;
  otpState.expiresAt = undefined;
  otpState.requestedAt = undefined;
  otpState.attempts = 0;
};

const setUserOtpState = (user, key, otp, ttlMs) => {
  const otpState = ensureUserOtpState(user, key);
  otpState.hash = hashOtp(otp);
  otpState.expiresAt = new Date(Date.now() + ttlMs);
  otpState.requestedAt = new Date();
  otpState.attempts = 0;
};

const canRequestOtp = (otpState) =>
  !otpState?.requestedAt || Date.now() - otpState.requestedAt.getTime() >= OTP_REQUEST_COOLDOWN_MS;

const registerInvalidOtpAttempt = (user, key) => {
  const otpState = ensureUserOtpState(user, key);
  otpState.attempts += 1;

  if (otpState.attempts >= MAX_OTP_ATTEMPTS) {
    clearUserOtpState(user, key);
    return true;
  }

  return false;
};

const isOtpExpired = (otpState) =>
  !otpState?.expiresAt || otpState.expiresAt.getTime() < Date.now();

const sendOtp = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const studentId = sanitizeStudentId(req.body.studentId);

    if (!isValidEmail(email) || !studentId) {
      return res
        .status(400)
        .json({ message: 'Enter a valid pre-approved email and student ID.' });
    }

    const approvedVoter = await ApprovedVoter.findOne({
      email,
      studentId,
      isActive: true,
      isUsed: false
    });

    if (!approvedVoter) {
      return res.status(403).json({
        message: 'This voter record is not approved for registration.'
      });
    }

    const otp = generateOtp();
    approvedVoter.otpHash = hashOtp(otp);
    approvedVoter.otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000);
    approvedVoter.otpAttempts = 0;
    approvedVoter.otpVerifiedAt = null;
    await approvedVoter.save();

    await sendEmail({
      to: email,
      subject: 'Your Zonexchoose OTP Code',
      text: `Your verification code is ${otp}. It expires in 5 minutes.`,
      html: `<p>Your verification code is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`
    });

    return res.json({
      message: 'OTP sent successfully. Please check your email.'
    });
  } catch (error) {
    next(error);
  }
};

const verifyOtp = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const studentId = sanitizeStudentId(req.body.studentId);
    const otp = sanitizeString(req.body.otp);

    const approvedVoter = await ApprovedVoter.findOne({
      email,
      studentId,
      isActive: true,
      isUsed: false
    });

    if (!approvedVoter || !approvedVoter.otpHash || !approvedVoter.otpExpiresAt) {
      return res.status(400).json({ message: 'OTP has not been requested.' });
    }

    if (approvedVoter.otpExpiresAt.getTime() < Date.now()) {
      clearApprovedVoterOtp(approvedVoter);
      await approvedVoter.save();
      return res.status(400).json({ message: 'OTP has expired. Request a new code.' });
    }

    if (approvedVoter.otpHash !== hashOtp(otp)) {
      approvedVoter.otpAttempts += 1;

      if (approvedVoter.otpAttempts >= MAX_OTP_ATTEMPTS) {
        clearApprovedVoterOtp(approvedVoter);
      }

      await approvedVoter.save();
      return res.status(400).json({ message: 'Incorrect OTP code.' });
    }

    approvedVoter.otpVerifiedAt = new Date();
    approvedVoter.otpHash = undefined;
    approvedVoter.otpExpiresAt = undefined;
    approvedVoter.otpAttempts = 0;
    await approvedVoter.save();

    return res.json({
      message: 'OTP verified successfully.',
      registrationToken: createRegistrationToken({ email, studentId })
    });
  } catch (error) {
    next(error);
  }
};

const register = async (req, res, next) => {
  try {
    const name = sanitizeString(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const studentId = sanitizeStudentId(req.body.studentId);
    const password = String(req.body.password || '');
    const registrationToken = String(req.body.registrationToken || '');

    if (!isValidName(name)) {
      return res.status(400).json({ message: 'Enter a valid full name.' });
    }

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
      });
    }

    let tokenPayload;
    try {
      tokenPayload = jwt.verify(registrationToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Registration token is invalid or expired.' });
    }

    if (
      tokenPayload.purpose !== 'register' ||
      tokenPayload.email !== email ||
      tokenPayload.studentId !== studentId
    ) {
      return res.status(401).json({ message: 'Registration token mismatch detected.' });
    }

    const approvedVoter = await ApprovedVoter.findOne({
      email,
      studentId,
      isActive: true,
      isUsed: false
    });

    if (!approvedVoter || !approvedVoter.otpVerifiedAt) {
      return res.status(403).json({ message: 'OTP verification is required first.' });
    }

    if (Date.now() - approvedVoter.otpVerifiedAt.getTime() > 10 * 60 * 1000) {
      return res.status(400).json({ message: 'OTP verification expired. Verify again.' });
    }

    const existingUser = await User.findOne({
      $or: [{ email }, { studentId }]
    });

    if (existingUser) {
      return res.status(409).json({ message: 'A user with those details already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await User.create({
      name,
      email,
      studentId,
      password: hashedPassword,
      role: 'voter',
      isVerified: true
    });

    approvedVoter.isUsed = true;
    clearApprovedVoterOtp(approvedVoter);
    await approvedVoter.save();

    const token = createAuthToken(user);
    return res.status(201).json({
      message: 'Registration completed successfully.',
      token,
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    next(error);
  }
};

const login = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const password = String(req.body.password || '');

    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required.' });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: 'Invalid email or password.' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'This account has been disabled.' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = createAuthToken(user);
    return res.json({
      message: 'Login successful.',
      token,
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    next(error);
  }
};

const forgotPassword = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const user = await User.findOne({
      email,
      role: 'voter',
      isActive: true
    });

    if (user && canRequestOtp(user.passwordResetOtp)) {
      const otp = generateOtp();
      setUserOtpState(user, 'passwordResetOtp', otp, RESET_OTP_TTL_MS);
      await user.save();

      await sendEmail({
        to: user.email,
        subject: 'Your Zonexchoose password reset code',
        text: `Your password reset OTP is ${otp}. It expires in 10 minutes.`,
        html: `<p>Your password reset OTP is <strong>${otp}</strong>.</p><p>It expires in 10 minutes.</p>`
      });
    }

    return res.json({
      message: GENERIC_PASSWORD_RESET_MESSAGE
    });
  } catch (error) {
    next(error);
  }
};

const verifyResetOtp = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const otp = sanitizeString(req.body.otp);

    if (!isValidEmail(email) || !isValidOtp(otp)) {
      return res.status(400).json({ message: 'Enter a valid email and 6-digit OTP.' });
    }

    const user = await User.findOne({
      email,
      role: 'voter',
      isActive: true
    });

    if (!user || !user.passwordResetOtp?.hash) {
      return res.status(400).json({ message: 'Invalid or expired OTP.' });
    }

    if ((user.passwordResetOtp.attempts || 0) >= MAX_OTP_ATTEMPTS) {
      clearUserOtpState(user, 'passwordResetOtp');
      await user.save();
      return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new code.' });
    }

    if (isOtpExpired(user.passwordResetOtp)) {
      clearUserOtpState(user, 'passwordResetOtp');
      await user.save();
      return res.status(400).json({ message: 'OTP has expired. Request a new code.' });
    }

    if (user.passwordResetOtp.hash !== hashOtp(otp)) {
      const limitReached = registerInvalidOtpAttempt(user, 'passwordResetOtp');
      await user.save();

      return res.status(limitReached ? 429 : 400).json({
        message: limitReached ? 'Too many invalid OTP attempts. Request a new code.' : 'Invalid or expired OTP.'
      });
    }

    clearUserOtpState(user, 'passwordResetOtp');
    await user.save();

    return res.json({
      message: 'OTP verified successfully.',
      resetToken: createPasswordResetToken(user)
    });
  } catch (error) {
    next(error);
  }
};

const resetPassword = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');
    const resetToken = String(req.body.resetToken || '');

    if (!isStrongPassword(password)) {
      return res.status(400).json({
        message:
          'Password must be at least 8 characters and include uppercase, lowercase, and a number.'
      });
    }

    let tokenPayload;
    try {
      tokenPayload = jwt.verify(resetToken, process.env.JWT_SECRET);
    } catch (error) {
      return res.status(401).json({ message: 'Reset token is invalid or expired.' });
    }

    if (tokenPayload.purpose !== 'password-reset') {
      return res.status(401).json({ message: 'Reset token is invalid or expired.' });
    }

    const user = await User.findOne({
      _id: tokenPayload.id,
      email: tokenPayload.email,
      role: 'voter',
      isActive: true
    });

    if (!user) {
      return res.status(400).json({ message: 'Unable to reset password for this account.' });
    }

    user.password = await bcrypt.hash(password, 12);
    clearUserOtpState(user, 'passwordResetOtp');
    await user.save();

    return res.json({
      message: 'Password reset successful. You can now sign in.'
    });
  } catch (error) {
    next(error);
  }
};

const sendLoginOtp = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);

    if (!isValidEmail(email)) {
      return res.status(400).json({ message: 'Enter a valid email address.' });
    }

    const user = await User.findOne({
      email,
      role: 'voter',
      isActive: true
    });

    if (user && canRequestOtp(user.loginOtp)) {
      const otp = generateOtp();
      setUserOtpState(user, 'loginOtp', otp, LOGIN_OTP_TTL_MS);
      await user.save();

      await sendEmail({
        to: user.email,
        subject: 'Your Zonexchoose login code',
        text: `Your login OTP is ${otp}. It expires in 5 minutes.`,
        html: `<p>Your login OTP is <strong>${otp}</strong>.</p><p>It expires in 5 minutes.</p>`
      });
    }

    return res.json({
      message: GENERIC_LOGIN_OTP_MESSAGE
    });
  } catch (error) {
    next(error);
  }
};

const loginWithOtp = async (req, res, next) => {
  try {
    const email = sanitizeEmail(req.body.email);
    const otp = sanitizeString(req.body.otp);

    if (!isValidEmail(email) || !isValidOtp(otp)) {
      return res.status(400).json({ message: 'Enter a valid email and 6-digit OTP.' });
    }

    const user = await User.findOne({
      email,
      role: 'voter',
      isActive: true
    });

    if (!user || !user.loginOtp?.hash) {
      return res.status(400).json({ message: 'Invalid or expired OTP. Request a new login code.' });
    }

    if ((user.loginOtp.attempts || 0) >= MAX_OTP_ATTEMPTS) {
      clearUserOtpState(user, 'loginOtp');
      await user.save();
      return res.status(429).json({ message: 'Too many invalid OTP attempts. Request a new login code.' });
    }

    if (isOtpExpired(user.loginOtp)) {
      clearUserOtpState(user, 'loginOtp');
      await user.save();
      return res.status(400).json({ message: 'OTP has expired. Request a new login code.' });
    }

    if (user.loginOtp.hash !== hashOtp(otp)) {
      const limitReached = registerInvalidOtpAttempt(user, 'loginOtp');
      await user.save();

      return res.status(limitReached ? 429 : 400).json({
        message: limitReached
          ? 'Too many invalid OTP attempts. Request a new login code.'
          : 'Invalid or expired OTP. Request a new login code.'
      });
    }

    clearUserOtpState(user, 'loginOtp');
    user.lastLogin = new Date();
    await user.save();

    const token = createAuthToken(user);
    return res.json({
      message: 'OTP login successful.',
      token,
      user: buildAuthUserPayload(user)
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res) => {
  return res.json({
    user: req.user
  });
};

module.exports = {
  sendOtp,
  verifyOtp,
  register,
  login,
  forgotPassword,
  verifyResetOtp,
  resetPassword,
  sendLoginOtp,
  loginWithOtp,
  me
};
