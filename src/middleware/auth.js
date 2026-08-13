const jwt = require('jsonwebtoken');
const User = require('../models/User');

const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Nincs token megadva' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({ error: 'A felhasználó nem található' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'A fiókod le lett tiltva.' });
    }

    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Érvénytelen vagy lejárt token' });
  }
};

const requireAdmin = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Nincs token megadva' });
  }

  const token = authHeader.split(' ')[1];
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Nincs admin jogosultságod' });
    }
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Érvénytelen admin token' });
  }
};

module.exports = { requireAuth, requireAdmin };
