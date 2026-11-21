
const User = require('../models/User');

const adminMiddleware = async (req, res, next) => {
  try {
    // Retrieve the authenticated user from MongoDB.
    const user = await User.findById(req.user.id).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Authentication required.',
      });
    }

    // Only administrators may continue.
    if (user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Access denied. Administrator privileges required.',
      });
    }

    req.admin = user;

    next();

  } catch (error) {
    console.error('Admin authorization error:', error);

    return res.status(500).json({
      success: false,
      message: 'Unable to verify administrator permissions.',
    });
  }
};

module.exports = adminMiddleware;
