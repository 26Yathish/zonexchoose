const mongoose = require('mongoose');

const candidateSchema = new mongoose.Schema(
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
    position: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    manifesto: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1200
    },
    bio: {
      type: String,
      trim: true,
      maxlength: 1200,
      default: ''
    },
    status: {
      type: String,
      enum: ['invited', 'pending_review', 'approved', 'rejected'],
      default: 'invited'
    },
    invitationToken: {
      type: String,
      unique: true,
      sparse: true
    },
    invitationExpiresAt: Date,
    governmentIdPath: String,
    governmentIdMime: String,
    photoPath: String,
    photoMime: String,
    documentsUploadedAt: Date,
    verificationNotes: {
      type: String,
      trim: true,
      maxlength: 600,
      default: ''
    },
    rejectionReason: {
      type: String,
      trim: true,
      maxlength: 400,
      default: ''
    },
    notificationSentAt: Date,
    verifiedAt: Date,
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    verifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

candidateSchema.index({ email: 1, studentId: 1, position: 1 }, { unique: true });

module.exports = mongoose.model('Candidate', candidateSchema);
