const express = require('express');
const { protect, adminOnly } = require('../middleware/auth');
const {
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
} = require('../controllers/adminController');

const router = express.Router();

router.use(protect, adminOnly);

router.get('/summary', getSummary);
router.get('/approved-voters', getApprovedVoters);
router.post('/approved-voters', addApprovedVoter);
router.post('/approved-voters/bulk', bulkAddApprovedVoters);
router.delete('/approved-voters/:id', deleteApprovedVoter);
router.post('/add-candidate', addCandidate);
router.post('/approve-candidate', approveCandidate);
router.post('/reject-candidate', rejectCandidate);
router.post('/toggle-voting', toggleVoting);
router.get('/results', getResults);

module.exports = router;
