const mongoose = require('mongoose');

const approvedVoterSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80
    },
    email: {
      type: String,
      required: true,
      trim: true,
      lowercase: true
    },
    studentId: {
      type: String,
      required: true,
      trim: true,
      uppercase: true
    },
    department: {
      type: String,
      trim: true,
      maxlength: 120,
      default: ''
    },
    isUsed: {
      type: Boolean,
      default: false
    },
    isActive: {
      type: Boolean,
      default: true
    },
    otpHash: String,
    otpExpiresAt: Date,
    otpAttempts: {
      type: Number,
      default: 0
    },
    otpVerifiedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

approvedVoterSchema.index({ email: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model('ApprovedVoter', approvedVoterSchema);
