require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const authRoutes = require('./routes/auth');
const adminRoutes = require('./routes/admin');

const http = require('http');
const { WebSocketServer } = require('ws');
const User = require('./models/User');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', authRoutes); // /api/register, /api/login
app.use('/api/admin', adminRoutes); // /api/admin/*

// Serve static files for Admin Dashboard
app.use(express.static(path.join(__dirname, '../public')));

// Serve static files for Remote App (so /assets/... resolves correctly)
app.use(express.static(path.join(__dirname, '../public/remote')));

// Serve Remote Web Panel for /:username
app.get('/:username', async (req, res, next) => {
  // If it's an API route or file with extension, skip this rule
  if (req.url.startsWith('/api') || req.url.includes('.')) {
    return next();
  }
  
  // Verify if username exists
  const user = await User.findOne({ username: req.params.username.toLowerCase() });
  if (user) {
    res.sendFile(path.join(__dirname, '../public/remote/index.html'));
  } else {
    res.status(404).send('Felhasználó nem található.');
  }
});

// Fallback for SPA routing in admin panel
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Database Connection
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB Atlas connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// WebSocket Relay Logic
// Keeps track of connections
const desktopClients = new Map(); // hwid -> ws
const mobileClients = new Map(); // username -> ws

wss.on('connection', (ws, req) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const hwid = url.searchParams.get('hwid');
  const user = url.searchParams.get('user'); // For mobile clients
  
  if (hwid) {
    // Desktop connection
    desktopClients.set(hwid, ws);
    console.log(`[WS] Desktop connected: ${hwid}`);
    
    ws.on('message', (message) => {
      // Forward from Desktop to Mobile
      User.findOne({ hwid }).then(dbUser => {
        if (dbUser && mobileClients.has(dbUser.username)) {
          mobileClients.get(dbUser.username).send(message, { binary: Buffer.isBuffer(message) });
        }
      });
    });
    
    ws.on('close', () => {
      desktopClients.delete(hwid);
      console.log(`[WS] Desktop disconnected: ${hwid}`);
    });
  } else if (user) {
    // Mobile connection
    mobileClients.set(user, ws);
    console.log(`[WS] Mobile connected for user: ${user}`);
    
    ws.on('message', (message) => {
      // Forward from Mobile to Desktop
      User.findOne({ username: user.toLowerCase() }).then(dbUser => {
        if (dbUser && dbUser.hwid && desktopClients.has(dbUser.hwid)) {
          desktopClients.get(dbUser.hwid).send(message, { binary: Buffer.isBuffer(message) });
        }
      });
    });
    
    ws.on('close', () => {
      mobileClients.delete(user);
      console.log(`[WS] Mobile disconnected for user: ${user}`);
    });
  } else {
    ws.close(1008, 'Missing identifiers');
  }
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Wand Elite V2 Server running on port ${PORT}`);
});
