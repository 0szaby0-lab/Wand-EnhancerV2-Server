const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
  },
  passwordHash: {
    type: String,
    required: true,
  },
  hwid: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: false,
  },
  subscriptionDays: {
    type: Number,
    default: 0,
  },
  subscriptionStarted: {
    type: Date,
    default: null,
  },
  subscriptionExpires: {
    type: Date,
    default: null,
  },
  assignedPort: {
    type: Number,
    unique: true,
  },
  lastLogin: {
    type: Date,
    default: null,
  },
  lastIp: {
    type: String,
    default: null,
  },
  loginCount: {
    type: Number,
    default: 0,
  },
  isBanned: {
    type: Boolean,
    default: false,
  },
  notes: {
    type: String,
    default: '',
  },
  isOnline: {
    type: Boolean,
    default: false,
  },
  lastHeartbeat: {
    type: Date,
    default: null,
  }
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
