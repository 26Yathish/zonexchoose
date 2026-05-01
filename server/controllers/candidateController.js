const fs = require('fs');
const path = require('path');
const Candidate = require('../models/Candidate');
const { sanitizeString, sanitizeStudentId } = require('../utils/sanitize');

const normalizeUploadPath = (filePath) =>
  `/uploads/${path.basename(filePath).replace(/\\/g, '/')}`;

const normalizeIdForComparison = (value = '') =>
  sanitizeStudentId(value).replace(/[^A-Z0-9]/g, '');

const cleanupUploadedFiles = async (files = {}) => {
  const uploads = Object.values(files).flat().filter(Boolean);
  await Promise.all(
    uploads.map((file) =>
      fs.promises.unlink(file.path).catch(() => undefined)
    )
  );
};

const getCandidateByToken = async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({
      invitationToken: req.params.token,
      invitationExpiresAt: { $gt: new Date() }
    }).select('name email position manifesto status studentId');

    if (!candidate) {
      return res.status(404).json({ message: 'This upload link is invalid or expired.' });
    }

    return res.json({ candidate });
  } catch (error) {
    next(error);
  }
};

const uploadDocuments = async (req, res, next) => {
  try {
    const candidate = await Candidate.findOne({
      invitationToken: req.params.token,
      invitationExpiresAt: { $gt: new Date() }
    });

    if (!candidate) {
      await cleanupUploadedFiles(req.files);
      return res.status(404).json({ message: 'This upload link is invalid or expired.' });
    }

    const governmentId = req.files?.governmentId?.[0];
    const photo = req.files?.photo?.[0];

    if (!governmentId || !photo) {
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        message: 'Government ID and candidate photo are both required.'
      });
    }

    if (!['image/jpeg', 'image/png'].includes(photo.mimetype)) {
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        message: 'Candidate photo must be a JPG or PNG image.'
      });
    }

    const submittedCandidateId = sanitizeStudentId(req.body.candidateId || req.body.uniqueId || '');
    if (!submittedCandidateId) {
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        message: 'Enter your unique candidate ID before uploading documents.'
      });
    }

    if (submittedCandidateId !== candidate.studentId) {
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        message: 'The entered candidate ID does not match this secure nomination link.'
      });
    }

    const normalizedCandidateId = normalizeIdForComparison(candidate.studentId);
    const normalizedFileName = normalizeIdForComparison(path.parse(governmentId.originalname).name);

    if (!normalizedFileName.includes(normalizedCandidateId)) {
      await cleanupUploadedFiles(req.files);
      return res.status(400).json({
        message:
          'The uploaded government ID file name must include your unique candidate ID.'
      });
    }

    candidate.governmentIdPath = normalizeUploadPath(governmentId.path);
    candidate.governmentIdMime = governmentId.mimetype;
    candidate.photoPath = normalizeUploadPath(photo.path);
    candidate.photoMime = photo.mimetype;
    candidate.bio = sanitizeString(req.body.bio || '');
    candidate.status = 'pending_review';
    candidate.documentsUploadedAt = new Date();
    await candidate.save();

    return res.json({
      message: 'Documents uploaded successfully. The admin will review your nomination shortly.'
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getCandidateByToken,
  uploadDocuments
};
