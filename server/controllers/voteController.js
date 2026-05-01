const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const ApprovedVoter = require('../models/ApprovedVoter');
const VotingConfig = require('../models/VotingConfig');
const User = require('../models/User');
const { sendEmail } = require('../utils/mailer');

const getConfig = async () => {
  let config = await VotingConfig.findOne();
  if (!config) {
    config = await VotingConfig.create({});
  }
  return config;
};

const getCandidates = async (req, res, next) => {
  try {
    const config = await getConfig();
    const candidates = await Candidate.find({ status: 'approved' })
      .select('name position manifesto bio photoPath status')
      .sort({ createdAt: 1 });

    return res.json({
      votingEnabled: config.votingEnabled,
      candidates
    });
  } catch (error) {
    next(error);
  }
};

const castVote = async (req, res, next) => {
  try {
    const config = await getConfig();
    if (!config.votingEnabled) {
      return res.status(403).json({ message: 'Voting is currently disabled.' });
    }

    if (req.user.role !== 'voter') {
      return res.status(403).json({ message: 'Only voter accounts can cast votes.' });
    }

    const existingVote = await Vote.findOne({ voter: req.user._id });
    if (existingVote || req.user.hasVoted) {
      return res.status(409).json({ message: 'Your vote has already been recorded.' });
    }

    const candidate = await Candidate.findOne({
      _id: req.body.candidateId,
      status: 'approved'
    });

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found or not approved.' });
    }

    await Vote.create({
      voter: req.user._id,
      candidate: candidate._id,
      voterSnapshot: {
        name: req.user.name,
        email: req.user.email,
        studentId: req.user.studentId
      }
    });

    await User.findByIdAndUpdate(req.user._id, { hasVoted: true });

    let responseMessage = `Your vote for ${candidate.name} has been recorded securely.`;

    try {
      await sendEmail({
        to: req.user.email,
        subject: 'Zonexchoose vote confirmation',
        text: `Hello ${req.user.name}, your vote for ${candidate.name} has been recorded successfully in Zonexchoose. This confirmation is for your records.`,
        html: `<p>Hello <strong>${req.user.name}</strong>,</p><p>Your vote for <strong>${candidate.name}</strong> has been recorded successfully in Zonexchoose.</p><p>This confirmation email is for your records. No further action is required.</p>`
      });
    } catch (mailError) {
      console.error('Vote confirmation email failed:', mailError);
      responseMessage += ' Your vote was saved, but the confirmation email could not be sent.';
    }

    return res.status(201).json({
      message: responseMessage
    });
  } catch (error) {
    next(error);
  }
};

const getTurnout = async (req, res, next) => {
  try {
    const totalVoters = await ApprovedVoter.countDocuments({ isActive: true });
    const votesCast = await Vote.countDocuments();
    const turnoutPercentage = totalVoters
      ? Number(((votesCast / totalVoters) * 100).toFixed(2))
      : 0;
    const config = await getConfig();

    return res.json({
      totalVoters,
      votesCast,
      turnoutPercentage,
      votingEnabled: config.votingEnabled,
      showResults: config.showResults
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCandidates,
  castVote,
  getTurnout
};
