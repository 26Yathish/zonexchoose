const errorHandler = (err, req, res, next) => {
  if (err.name === 'MulterError') {
    return res.status(400).json({ message: err.message });
  }

  if (err.code === 11000) {
    return res.status(409).json({ message: 'Duplicate record detected.' });
  }

  console.error(err);
  return res.status(err.statusCode || 500).json({
    message: err.message || 'Something went wrong on the server.'
  });
};

module.exports = errorHandler;
