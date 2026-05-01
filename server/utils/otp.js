const crypto = require('crypto');

const generateOtp = () => String(Math.floor(100000 + Math.random() * 900000));

const hashOtp = (otp) =>
  crypto.createHash('sha256').update(String(otp)).digest('hex');

const generateInvitationToken = () => crypto.randomBytes(24).toString('hex');

module.exports = {
  generateOtp,
  hashOtp,
  generateInvitationToken
};
