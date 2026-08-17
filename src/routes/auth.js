const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');

const PORT_START = 3300;
const PORT_END = 3599;

// Helper to check if subscription is active
const isSubActive = (user) => {
  if (!user.isActive) return false;
  if (!user.subscriptionExpires) return false;
  return new Date() < user.subscriptionExpires;
};

router.post('/register', async (req, res) => {
  try {
    const { username, password, hwid } = req.body;

    if (!username || !password || !hwid) {
      return res.status(400).json({ error: 'Minden mező kitöltése kötelező' });
    }

    const existingUser = await User.findOne({ username: username.toLowerCase() });
    if (existingUser) {
      return res.status(400).json({ error: 'Ez a felhasználónév már foglalt' });
    }

    // Find next available port
    const users = await User.find().sort('assignedPort');
    let assignedPort = PORT_START;
    for (const user of users) {
      if (user.assignedPort === assignedPort) {
        assignedPort++;
      }
    }
    
    if (assignedPort > PORT_END) {
      return res.status(500).json({ error: 'Nincs több szabad port' });
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);

    const user = new User({
      username,
      passwordHash,
      hwid, // lock HWID on registration
      assignedPort,
    });

    await user.save();

    res.status(201).json({ message: 'Sikeres regisztráció! Kérlek várj, amíg egy admin aktiválja az előfizetésedet.' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Szerver hiba történt' });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { username, password, hwid } = req.body;
    const ip = req.ip || req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!username || !password || !hwid) {
      return res.status(400).json({ error: 'Minden mező kitöltése kötelező' });
    }

    const user = await User.findOne({ username: username.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
    }

    const isMatch = await bcrypt.compare(password, user.passwordHash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Hibás felhasználónév vagy jelszó' });
    }

    if (user.isBanned) {
      return res.status(403).json({ error: 'A fiókod le lett tiltva.' });
    }

    // HWID check
    if (user.hwid && user.hwid !== hwid) {
      return res.status(403).json({ error: 'HWID hiba! Ezt a fiókot egy másik géphez rendelték. Kérj HWID resetet az admintól.' });
    }

    // Lock HWID if it was empty (e.g. after reset)
    if (!user.hwid) {
      user.hwid = hwid;
    }

    // Check subscription
    if (!isSubActive(user)) {
      user.isActive = false; // Sync state
      await user.save();
      return res.status(403).json({ error: 'Nincs aktív előfizetésed!' });
    }

    user.lastLogin = new Date();
    user.lastIp = ip;
    user.loginCount += 1;
    user.isOnline = true;
    user.lastHeartbeat = new Date();
    await user.save();

    const token = jwt.sign(
      { id: user._id, username: user.username },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({
      token,
      username: user.username,
      port: user.assignedPort,
      expiresAt: user.subscriptionExpires
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Szerver hiba történt' });
  }
});

router.post('/validate', requireAuth, async (req, res) => {
  const user = req.user;
  
  if (!isSubActive(user)) {
    user.isActive = false;
    await user.save();
    return res.status(403).json({ error: 'Az előfizetésed lejárt!' });
  }

  res.json({ valid: true, port: user.assignedPort, expiresAt: user.subscriptionExpires });
});

router.post('/heartbeat', requireAuth, async (req, res) => {
  const user = req.user;
  
  if (!isSubActive(user)) {
    user.isActive = false;
    user.isOnline = false;
    await user.save();
    return res.status(403).json({ error: 'Az előfizetésed lejárt!' });
  }

  user.isOnline = true;
  user.lastHeartbeat = new Date();
  await user.save();

  res.json({ ok: true });
});

// Legacy C++ DLL auth endpoint
router.post('/auth', async (req, res) => {
  try {
    const { hwid } = req.body;
    if (!hwid) {
      return res.status(400).json({ error: 'Missing HWID' });
    }
    const user = await User.findOne({ hwid: hwid });
    if (!user || user.isBanned || !isSubActive(user)) {
      return res.status(403).json({ authorized: false });
    }
    return res.json({ 
      authorized: true, 
      username: user.username,
      expiresAt: user.subscriptionExpires
    });
  } catch (error) {
    res.status(500).json({ authorized: false });
  }
});

// Game status endpoint for Electron bridge
router.post('/game-status', async (req, res) => {
  try {
    const { hwid, gameName } = req.body;
    if (!hwid) {
      return res.status(400).json({ error: 'Missing HWID' });
    }
    const user = await User.findOne({ hwid: hwid });
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Update currently playing status
    user.currentlyPlaying = gameName || null;
    user.lastGameUpdate = new Date();
    await user.save();
    
    return res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;

