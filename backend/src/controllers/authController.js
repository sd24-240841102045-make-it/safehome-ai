import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { get, run } from '../services/db.js';
import { generateToken } from '../middleware/auth.js';

export async function register(req, res, next) {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password || !full_name) {
      return res.status(400).json({ success: false, error: 'Email, password, and full name are required.' });
    }

    if (password.length < 8) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters long.' });
    }

    // Check if user already exists
    const existing = await get('SELECT id FROM users WHERE email = ?', [email.toLowerCase().trim()]);
    if (existing) {
      return res.status(409).json({ success: false, error: 'An account with this email already exists.' });
    }

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const password_hash = await bcrypt.hash(password, salt);
    const userId = `usr_${crypto.randomUUID()}`;

    // Insert user
    await run(
      'INSERT INTO users (id, email, password_hash, full_name, role) VALUES (?, ?, ?, ?, ?)',
      [userId, email.toLowerCase().trim(), password_hash, full_name.trim(), 'homeowner']
    );

    // Create default home
    const homeId = `home_${crypto.randomUUID()}`;
    await run(
      'INSERT INTO homes (id, user_id, name, address, active_hours_start, active_hours_end) VALUES (?, ?, ?, ?, ?, ?)',
      [homeId, userId, 'My Home', 'Primary Residence', '07:00', '23:00']
    );

    // Create default user settings
    await run(
      'INSERT INTO user_settings (user_id, expected_active_start, expected_active_end, confidence_threshold) VALUES (?, ?, ?, ?)',
      [userId, '07:00', '23:00', 0.55]
    );

    const user = { id: userId, email: email.toLowerCase().trim(), full_name: full_name.trim(), role: 'homeowner' };
    const token = generateToken(user);

    res.status(201).json({
      success: true,
      message: 'Account registered successfully.',
      user,
      token
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ success: false, error: 'Email and password are required.' });
    }

    const user = await get(
      'SELECT id, email, password_hash, full_name, role FROM users WHERE email = ?',
      [email.toLowerCase().trim()]
    );

    if (!user) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ success: false, error: 'Invalid email or password.' });
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        role: user.role
      },
      token
    });
  } catch (err) {
    next(err);
  }
}

export async function getMe(req, res, next) {
  try {
    const user = await get(
      'SELECT id, email, full_name, role, created_at FROM users WHERE id = ?',
      [req.user.id]
    );

    if (!user) {
      return res.status(404).json({ success: false, error: 'User not found.' });
    }

    const home = await get('SELECT * FROM homes WHERE user_id = ? LIMIT 1', [user.id]);
    const settings = await get('SELECT * FROM user_settings WHERE user_id = ?', [user.id]);

    res.json({
      success: true,
      user,
      home: home || null,
      settings: settings || null
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req, res) {
  res.json({ success: true, message: 'Logged out successfully.' });
}
