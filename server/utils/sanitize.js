const sanitizeString = (value = '') =>
  String(value)
    .trim()
    .replace(/[<>]/g, '');

const sanitizeEmail = (value = '') => sanitizeString(value).toLowerCase();

const sanitizeStudentId = (value = '') =>
  sanitizeString(value).replace(/\s+/g, '').toUpperCase();

const isValidEmail = (value = '') =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value).trim());

const isStrongPassword = (value = '') =>
  /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/.test(String(value));

const isValidName = (value = '') =>
  /^[a-zA-Z\s.'-]{2,80}$/.test(String(value).trim());

module.exports = {
  sanitizeString,
  sanitizeEmail,
  sanitizeStudentId,
  isValidEmail,
  isStrongPassword,
  isValidName
};
