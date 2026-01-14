import User from '../models/User.model.js';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { asyncHandler } from '../utils/async.handler.js';

const JWT_SECRET = process.env.JWT_SECRET || 'changeme';

// GET /api/auth/me - Validate session and return user info
export const me = asyncHandler(async (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: req.user });
});

// POST /api/auth/register - Register a new user
export const register = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const existing = await User.findOne({ username });
  if (existing) return res.status(409).json({ error: 'username taken' });

  const hash = await bcrypt.hash(password, 10);
  const user = await User.create({ username, password: hash });

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, username: user.username } });
});

// POST /api/auth/login - Login a user and return JWT
export const login = asyncHandler(async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'username and password required' });

  const user = await User.findOne({ username });
  if (!user) return res.status(401).json({ error: 'invalid credentials' });

  const match = await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: 'invalid credentials' });

  const token = jwt.sign({ id: user._id, username: user.username }, JWT_SECRET, { expiresIn: '7d' });
  res.json({ token, user: { id: user._id, username: user.username } });
});

