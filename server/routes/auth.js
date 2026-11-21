const express = require('express');
const router = express.Router();

const VALID_USER = '1001';
const VALID_PASS = 'Adil@123';
const AUTH_TOKEN = 'ibrahim_auth_secure_token_1001_session';

router.post('/login', (req, res) => {
  try {
    const { username, password } = req.body || {};
    const u = (username || '').toString().trim();
    const p = (password || '').toString().trim();

    if (u === VALID_USER && p === VALID_PASS) {
      return res.json({
        success: true,
        message: 'Login successful',
        token: AUTH_TOKEN,
        user: {
          username: '1001',
          name: 'Muhammad Adil Iqbal',
          role: 'Administrator'
        }
      });
    }

    return res.status(401).json({
      success: false,
      message: 'Invalid Username or Password! Please enter correct credentials.'
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get('/check', (req, res) => {
  const token = req.headers['authorization'] || req.headers['x-auth-token'];
  const cleanToken = token ? token.replace(/^Bearer\s+/i, '').trim() : '';

  if (cleanToken === AUTH_TOKEN) {
    return res.json({
      success: true,
      user: {
        username: '1001',
        name: 'Muhammad Adil Iqbal',
        role: 'Administrator'
      }
    });
  }

  return res.status(401).json({ success: false, message: 'Session expired or invalid' });
});

module.exports = router;
