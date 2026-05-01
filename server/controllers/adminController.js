const ApprovedVoter = require('../models/ApprovedVoter');
const Candidate = require('../models/Candidate');
const Vote = require('../models/Vote');
const VotingConfig = require('../models/VotingConfig');
const { sendEmail } = require('../utils/mailer');
const { generateInvitationToken } = require('../utils/otp');
const {
  sanitizeString,
  sanitizeEmail,
  sanitizeStudentId,
  isValidEmail,
  isValidName
} = require('../utils/sanitize');

const getConfig = async () => {
  let config = await VotingConfig.findOne();
  if (!config) {
    config = await VotingConfig.create({});
  }
  return config;
};

const getTurnoutSnapshot = async () => {
  const totalVoters = await ApprovedVoter.countDocuments({ isActive: true });
  const votesCast = await Vote.countDocuments();
  return {
    totalVoters,
    votesCast,
    turnoutPercentage: totalVoters
      ? Number(((votesCast / totalVoters) * 100).toFixed(2))
      : 0
  };
};

const getSummary = async (req, res, next) => {
  try {
    const [config, turnout, candidates, approvedVoters] = await Promise.all([
      getConfig(),
      getTurnoutSnapshot(),
      Candidate.find().sort({ createdAt: -1 }),
      ApprovedVoter.find().sort({ createdAt: -1 }).select('-otpHash')
    ]);

    return res.json({
      config,
      turnout,
      candidates,
      approvedVoters
    });
  } catch (error) {
    next(error);
  }
};

const buildBulkVoterName = (email, studentId) => {
  const localPart = sanitizeString(String(email).split('@')[0] || '')
    .replace(/[._-]+/g, ' ')
    .slice(0, 80);

  return localPart || `Voter ${studentId}`;
};

const normalizeBulkApprovedVoters = (entries = [], userId) => {
  const voters = [];
  let failedCount = 0;

  entries.forEach((entry) => {
    const email = sanitizeEmail(entry?.email);
    const studentId = sanitizeStudentId(entry?.studentId);

    if (!isValidEmail(email) || !studentId) {
      failedCount += 1;
      return;
    }

    voters.push({
      name: buildBulkVoterName(email, studentId),
      email,
      studentId,
      isActive: true,
      isUsed: false,
      createdBy: userId
    });
  });

  return { voters, failedCount };
};

const getInsertedCountFromBulkError = (error) => {
  if (Array.isArray(error.insertedDocs)) {
    return error.insertedDocs.length;
  }

  if (typeof error.result?.result?.nInserted === 'number') {
    return error.result.result.nInserted;
  }

  if (typeof error.result?.nInserted === 'number') {
    return error.result.nInserted;
  }

  return 0;
};

const addApprovedVoter = async (req, res, next) => {
  try {
    const name = sanitizeString(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const studentId = sanitizeStudentId(req.body.studentId);
    const department = sanitizeString(req.body.department || '');

    if (!isValidName(name) || !isValidEmail(email) || !studentId) {
      return res.status(400).json({ message: 'Enter valid voter details.' });
    }

    const existing = await ApprovedVoter.findOne({ email, studentId });
    if (existing) {
      return res.status(409).json({ message: 'That approved voter already exists.' });
    }

    const voter = await ApprovedVoter.create({
      name,
      email,
      studentId,
      department,
      createdBy: req.user._id
    });

    return res.status(201).json({
      message: 'Approved voter added successfully.',
      voter
    });
  } catch (error) {
    next(error);
  }
};

const bulkAddApprovedVoters = async (req, res, next) => {
  try {
    const entries = Array.isArray(req.body) ? req.body : req.body?.voters;

    if (!Array.isArray(entries)) {
      return res.status(400).json({ message: 'Upload a valid array of approved voters.' });
    }

    const { voters, failedCount: invalidCount } = normalizeBulkApprovedVoters(
      entries,
      req.user._id
    );

    if (!voters.length) {
      return res.status(400).json({
        message: 'No valid approved voter rows were found in the upload.',
        totalInserted: 0,
        failedCount: invalidCount
      });
    }

    let totalInserted = 0;
    let failedCount = invalidCount;

    try {
      const insertedVoters = await ApprovedVoter.insertMany(voters, {
        ordered: false
      });
      totalInserted = insertedVoters.length;
    } catch (error) {
      totalInserted = getInsertedCountFromBulkError(error);
      failedCount += voters.length - totalInserted;

      const hasWriteErrors =
        error.code === 11000 || (Array.isArray(error.writeErrors) && error.writeErrors.length);

      if (!hasWriteErrors && totalInserted === 0) {
        return next(error);
      }
    }

    if (!failedCount) {
      failedCount = voters.length - totalInserted + invalidCount;
    }

    return res.status(totalInserted ? 201 : 200).json({
      message: 'Bulk approved voter upload completed.',
      totalInserted,
      failedCount
    });
  } catch (error) {
    next(error);
  }
};

const getApprovedVoters = async (req, res, next) => {
  try {
    const voters = await ApprovedVoter.find().sort({ createdAt: -1 }).select('-otpHash');
    return res.json({ voters });
  } catch (error) {
    next(error);
  }
};

const deleteApprovedVoter = async (req, res, next) => {
  try {
    const voter = await ApprovedVoter.findById(req.params.id);

    if (!voter) {
      return res.status(404).json({ message: 'Approved voter not found.' });
    }

    if (voter.isUsed) {
      return res.status(409).json({
        message:
          'This approved voter has already been used for registration and cannot be deleted.'
      });
    }

    await voter.deleteOne();

    return res.json({
      message: 'Approved voter deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

const addCandidate = async (req, res, next) => {
  try {
    const config = await getConfig();
    if (!config.nominationEnabled) {
      return res.status(403).json({ message: 'Candidate nomination is currently disabled.' });
    }

    const name = sanitizeString(req.body.name);
    const email = sanitizeEmail(req.body.email);
    const studentId = sanitizeStudentId(req.body.studentId);
    const position = sanitizeString(req.body.position);
    const manifesto = sanitizeString(req.body.manifesto);

    if (!isValidName(name) || !isValidEmail(email) || !studentId || !position || !manifesto) {
      return res.status(400).json({ message: 'Enter valid candidate details.' });
    }

    const existing = await Candidate.findOne({ email, studentId, position });
    if (existing) {
      return res.status(409).json({ message: 'This candidate nomination already exists.' });
    }

    const invitationToken = generateInvitationToken();
    const candidate = await Candidate.create({
      name,
      email,
      studentId,
      position,
      manifesto,
      invitationToken,
      invitationExpiresAt: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000),
      notificationSentAt: new Date(),
      createdBy: req.user._id
    });

    const uploadLink = `${process.env.CLIENT_URL || 'http://localhost:5000'}/upload-docs.html?token=${invitationToken}`;

    await sendEmail({
      to: email,
      subject: 'Zonexchoose Candidate Verification Request',
      text: `You have been nominated for ${position}. Your unique candidate ID is ${studentId}. Upload your documents here: ${uploadLink}. Make sure your government ID upload file name includes this ID.`,
      html: `<p>You have been nominated for <strong>${position}</strong>.</p><p>Your unique candidate ID is <strong>${studentId}</strong>.</p><p>Complete verification using this secure link:</p><p><a href="${uploadLink}">${uploadLink}</a></p><p>Your government ID upload file name must include this ID so it can be verified.</p>`
    });

    return res.status(201).json({
      message: 'Candidate invited and notification email sent.',
      candidate
    });
  } catch (error) {
    next(error);
  }
};

const approveCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.body.candidateId);

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found.' });
    }

    if (!candidate.governmentIdPath || !candidate.photoPath) {
      return res.status(400).json({
        message: 'Candidate documents must be uploaded before approval.'
      });
    }

    candidate.status = 'approved';
    candidate.verificationNotes = sanitizeString(req.body.notes || '');
    candidate.verifiedBy = req.user._id;
    candidate.verifiedAt = new Date();
    candidate.rejectionReason = '';
    await candidate.save();

    await sendEmail({
      to: candidate.email,
      subject: 'Your Zonexchoose nomination was approved',
      text: `Congratulations, your nomination for ${candidate.position} has been approved.`,
      html: `<p>Congratulations. Your nomination for <strong>${candidate.position}</strong> has been approved.</p>`
    });

    return res.json({
      message: 'Candidate approved successfully.',
      candidate
    });
  } catch (error) {
    next(error);
  }
};

const rejectCandidate = async (req, res, next) => {
  try {
    const candidate = await Candidate.findById(req.body.candidateId);

    if (!candidate) {
      return res.status(404).json({ message: 'Candidate not found.' });
    }

    candidate.status = 'rejected';
    candidate.rejectionReason = sanitizeString(req.body.reason || 'Verification requirements not met.');
    candidate.verificationNotes = sanitizeString(req.body.reason || '');
    candidate.verifiedBy = req.user._id;
    candidate.verifiedAt = new Date();
    await candidate.save();

    await sendEmail({
      to: candidate.email,
      subject: 'Your Zonexchoose nomination was not approved',
      text: `Your nomination for ${candidate.position} was rejected. Reason: ${candidate.rejectionReason}`,
      html: `<p>Your nomination for <strong>${candidate.position}</strong> was rejected.</p><p>Reason: ${candidate.rejectionReason}</p>`
    });

    return res.json({
      message: 'Candidate rejected successfully.',
      candidate
    });
  } catch (error) {
    next(error);
  }
};

const toggleVoting = async (req, res, next) => {
  try {
    const config = await getConfig();
    const { votingEnabled, showResults, nominationEnabled } = req.body;

    if (typeof votingEnabled === 'boolean') {
      config.votingEnabled = votingEnabled;
    }

    if (typeof showResults === 'boolean') {
      config.showResults = showResults;
      config.resultPublishedAt = showResults ? new Date() : null;
    }

    if (typeof nominationEnabled === 'boolean') {
      config.nominationEnabled = nominationEnabled;
    }

    config.updatedBy = req.user._id;
    await config.save();

    return res.json({
      message: 'Voting configuration updated.',
      config
    });
  } catch (error) {
    next(error);
  }
};

const getResults = async (req, res, next) => {
  try {
    const config = await getConfig();
    if (!config.showResults) {
      return res.status(403).json({
        message: 'Results are locked until the admin enables visibility.'
      });
    }

    const results = await Vote.aggregate([
      {
        $group: {
          _id: '$candidate',
          votes: { $sum: 1 }
        }
      },
      {
        $lookup: {
          from: 'candidates',
          localField: '_id',
          foreignField: '_id',
          as: 'candidate'
        }
      },
      {
        $unwind: '$candidate'
      },
      {
        $project: {
          _id: 0,
          candidateId: '$candidate._id',
          name: '$candidate.name',
          position: '$candidate.position',
          votes: 1
        }
      },
      {
        $sort: {
          votes: -1,
          name: 1
        }
      }
    ]);

    const turnout = await getTurnoutSnapshot();

    return res.json({
      turnout,
      results
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getSummary,
  addApprovedVoter,
  bulkAddApprovedVoters,
  getApprovedVoters,
  deleteApprovedVoter,
  addCandidate,
  approveCandidate,
  rejectCandidate,
  toggleVoting,
  getResults
};
