require('dotenv').config();

const path = require('path');
const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');
const authRoutes = require('./routes/authRoutes');
const voteRoutes = require('./routes/voteRoutes');
const adminRoutes = require('./routes/adminRoutes');
const candidateRoutes = require('./routes/candidateRoutes');
const seedDefaults = require('./utils/seed');

const app = express();
const PORT = process.env.PORT || 5000;
const clientDir = path.join(__dirname, '..', 'client');

const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    message: 'Too many authentication attempts. Please try again shortly.'
  }
});

app.use(
  helmet({
    crossOriginResourcePolicy: false
  })
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/vote', voteRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/candidates', candidateRoutes);
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use(express.static(clientDir));

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(clientDir, 'index.html'));
});

app.get(
  ['/login.html', '/admin-login.html', '/register.html', '/dashboard.html', '/vote.html', '/admin.html', '/upload-docs.html'],
  (req, res) => {
    res.sendFile(path.join(clientDir, req.path.replace('/', '')));
  }
);

app.use((req, res) => {
  res.status(404).json({ message: 'Route not found.' });
});

app.use(errorHandler);

const startServer = async () => {
  await connectDB();
  await seedDefaults();

  app.listen(PORT, () => {
    console.log(`Zonexchoose server running on http://localhost:${PORT}`);
  });
};

startServer();
