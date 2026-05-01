const express = require('express');
const { uploadCandidateDocuments } = require('../middleware/upload');
const {
  getCandidateByToken,
  uploadDocuments
} = require('../controllers/candidateController');

const router = express.Router();

router.get('/by-token/:token', getCandidateByToken);
router.post('/upload/:token', uploadCandidateDocuments, uploadDocuments);

module.exports = router;
