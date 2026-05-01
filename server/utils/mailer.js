const nodemailer = require('nodemailer');

let transporter;

const createTransporter = async () => {
  if (transporter) {
    return transporter;
  }

  if (
    process.env.EMAIL_USER &&
    process.env.EMAIL_PASS &&
    process.env.EMAIL_USER !== 'demo@example.com'
  ) {
    transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });
  } else {
    transporter = nodemailer.createTransport({
      streamTransport: true,
      newline: 'unix',
      buffer: true
    });
  }

  return transporter;
};

const sendEmail = async ({ to, subject, html, text }) => {
  const mailer = await createTransporter();
  const info = await mailer.sendMail({
    from: `"Zonexchoose" <${process.env.EMAIL_USER || 'no-reply@zonexchoose.local'}>`,
    to,
    subject,
    html,
    text
  });

  if (info.message) {
    console.log(info.message.toString());
  }

  return info;
};

module.exports = {
  sendEmail
};
