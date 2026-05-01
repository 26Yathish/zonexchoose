const bcrypt = require('bcryptjs');
const User = require('../models/User');
const VotingConfig = require('../models/VotingConfig');

const seedDefaults = async () => {
  const configCount = await VotingConfig.countDocuments();
  if (!configCount) {
    await VotingConfig.create({});
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    return;
  }

  const existingAdmin = await User.findOne({ email: adminEmail });
  if (!existingAdmin) {
    const hashedPassword = await bcrypt.hash(adminPassword, 12);
    await User.create({
      name: 'Platform Administrator',
      email: adminEmail,
      studentId: 'ADMIN-0001',
      password: hashedPassword,
      role: 'admin',
      isVerified: true
    });
    console.log(`Bootstrap admin created for ${adminEmail}`);  //
  }
};

module.exports = seedDefaults;
