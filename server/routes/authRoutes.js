const express = require('express');
const rateLimit = require('express-rate-limit');
const { protect } = require('../middleware/auth');
const {
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
} = require('../controllers/authController');

const router = express.Router();
const otpRequestLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many OTP requests. Please wait before trying again.'
  }
});

router.post('/send-otp', otpRequestLimiter, sendOtp);
router.post('/verify-otp', verifyOtp);
router.post('/register', register);
router.post('/login', login);
router.post('/forgot-password', otpRequestLimiter, forgotPassword);
router.post('/verify-reset-otp', verifyResetOtp);
router.post('/reset-password', resetPassword);
router.post('/send-login-otp', otpRequestLimiter, sendLoginOtp);
router.post('/login-with-otp', loginWithOtp);
router.get('/me', protect, me);

module.exports = router;
