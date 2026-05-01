const express = require('express');
const { protect } = require('../middleware/auth');
const {
  getCandidates,
  castVote,
  getTurnout
} = require('../controllers/voteController');

const router = express.Router();

router.get('/candidates', protect, getCandidates);
router.post('/cast', protect, castVote);
router.get('/turnout', getTurnout);

module.exports = router;
