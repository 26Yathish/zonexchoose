const mongoose = require('mongoose');

const votingConfigSchema = new mongoose.Schema(
  {
    votingEnabled: {
      type: Boolean,
      default: false
    },
    showResults: {
      type: Boolean,
      default: false
    },
    nominationEnabled: {
      type: Boolean,
      default: true
    },
    electionTitle: {
      type: String,
      trim: true,
      default: 'Zonexchoose General Decision Session'
    },
    resultPublishedAt: Date,
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model('VotingConfig', votingConfigSchema);
