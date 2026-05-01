const mongoose = require('mongoose');

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true
    },
    studentId: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true
    },
    password: {
      type: String,
      required: true
    },
    role: {
      type: String,
      enum: ['voter', 'admin'],
      default: 'voter'
    },
    isVerified: {
      type: Boolean,
      default: true
    },
    isActive: {
      type: Boolean,
      default: true
    },
    hasVoted: {
      type: Boolean,
      default: false
    },
    loginOtp: {
      hash: String,
      expiresAt: Date,
      requestedAt: Date,
      attempts: {
        type: Number,
        default: 0
      }
    },
    passwordResetOtp: {
      hash: String,
      expiresAt: Date,
      requestedAt: Date,
      attempts: {
        type: Number,
        default: 0
      }
    },
    lastLogin: Date,
    preferences: {
      darkMode: {
        type: Boolean,
        default: false
      },
      highContrast: {
        type: Boolean,
        default: false
      },
      voiceAssist: {
        type: Boolean,
        default: true
      }
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('User', userSchema);
