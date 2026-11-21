const express = require('express');
const cors = require('cors');
const path = require('path');
const db = require('./db');

const app = express();
const PORT = process.env.PORT || 3721;

app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Middleware to ensure database is ready on serverless environments
let dbInitPromise = null;
app.use(async (req, res, next) => {
  if (!dbInitPromise) {
    dbInitPromise = db.initDb();
  }
  try {
    await dbInitPromise;
    next();
  } catch (err) {
    res.status(500).json({ success: false, message: 'Database initialization error: ' + err.message });
  }
});

// Serve frontend static files
app.use(express.static(path.join(__dirname, '..', 'public')));

// Register API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/products', require('./routes/products'));
app.use('/api/customers', require('./routes/customers'));
app.use('/api/suppliers', require('./routes/suppliers'));
app.use('/api/sales', require('./routes/sales'));
app.use('/api/purchases', require('./routes/purchases'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/expenses', require('./routes/expenses'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/backup', require('./routes/backup'));

// System info endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    appName: 'Ibrahim Surgical Store Offline System',
    storage: db.DATA_DIR,
    timestamp: new Date()
  });
});

// Single Page fallback for direct URL access
app.use((req, res) => {
  res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

// Start Server
async function start() {
  try {
    console.log('--- Starting Ibrahim Surgical Store System ---');
    await db.initDb();
    // Auto-seeding disabled so products/contacts stay empty for manual entry

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`====================================================`);
      console.log(` [OK] Ibrahim Surgical Store Server is Running!`);
      console.log(` [URL] Local Access: http://localhost:${PORT}`);
      console.log(` [DB] Safe Database Location: ${db.DB_FILE}`);
      console.log(` [BACKUP] Safe Backups Location: ${db.BACKUP_DIR}`);
      console.log(`====================================================`);
    });
  } catch (err) {
    console.error('Fatal startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown handling
process.on('SIGINT', () => {
  console.log('\nShutting down cleanly...');
  db.createBackup('shutdown');
  db.saveDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.createBackup('shutdown');
  db.saveDb();
  process.exit(0);
});

if (!process.env.VERCEL) {
  start();
}

module.exports = app;
