const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAdmin } = require('../middleware/auth');

// Admin Login
router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (username === process.env.ADMIN_USERNAME && 
      password === process.env.ADMIN_PASSWORD) {
      
    const token = jwt.sign(
      { role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );
    return res.json({ token });
  }
  
  return res.status(401).json({ error: 'Hibás admin hitelesítő adatok' });
});

// All routes below require admin token
router.use(requireAdmin);

// Get all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort('-createdAt');
    
    // Update online status based on heartbeat (5 mins timeout)
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60000);
    
    const updatedUsers = users.map(user => {
      const isActuallyOnline = user.isOnline && user.lastHeartbeat && user.lastHeartbeat > fiveMinsAgo;
      
      // Auto expire subscription if needed
      let isActive = user.isActive;
      if (isActive && user.subscriptionExpires && now > user.subscriptionExpires) {
        isActive = false;
        // Fire and forget save
        User.updateOne({ _id: user._id }, { isActive: false, isOnline: false }).exec();
      }

      return {
        ...user.toObject(),
        isOnline: isActuallyOnline,
        isActive: isActive
      };
    });

    res.json(updatedUsers);
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Update user (notes, ban)
router.put('/users/:id', async (req, res) => {
  try {
    const { isBanned, notes } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { isBanned, notes },
      { new: true }
    ).select('-passwordHash');
    
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Set subscription
router.post('/users/:id/subscription', async (req, res) => {
  try {
    const { days } = req.body;
    const user = await User.findById(req.params.id);
    
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    
    if (days <= 0) {
      user.isActive = false;
      user.subscriptionDays = 0;
      user.subscriptionExpires = null;
    } else {
      user.isActive = true;
      user.subscriptionDays = days;
      user.subscriptionStarted = new Date();
      
      const expires = new Date();
      expires.setDate(expires.getDate() + Number(days));
      user.subscriptionExpires = expires;
    }
    
    await user.save();
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Reset HWID
router.post('/users/:id/reset-hwid', async (req, res) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { hwid: null },
      { new: true }
    ).select('-passwordHash');
    
    if (!user) return res.status(404).json({ error: 'Felhasználó nem található' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Delete user
router.delete('/users/:id', async (req, res) => {
  try {
    await User.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

// Get stats
router.get('/stats', async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const activeSubs = await User.countDocuments({ isActive: true });
    const bannedUsers = await User.countDocuments({ isBanned: true });
    
    const now = new Date();
    const fiveMinsAgo = new Date(now.getTime() - 5 * 60000);
    const onlineUsers = await User.countDocuments({ 
      isOnline: true,
      lastHeartbeat: { $gt: fiveMinsAgo }
    });
    
    res.json({
      totalUsers,
      activeSubs,
      bannedUsers,
      onlineUsers
    });
  } catch (error) {
    res.status(500).json({ error: 'Szerver hiba' });
  }
});

module.exports = router;
