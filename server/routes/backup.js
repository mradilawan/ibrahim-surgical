const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const db = require('../db');

// Backup status and files list
router.get('/status', (req, res) => {
  try {
    const backupDir = db.BACKUP_DIR;
    const dataDir = db.DATA_DIR;
    const dbFile = db.DB_FILE;

    let backups = [];
    if (fs.existsSync(backupDir)) {
      backups = fs.readdirSync(backupDir)
        .filter(f => f.endsWith('.sqlite'))
        .map(f => {
          const stats = fs.statSync(path.join(backupDir, f));
          return {
            filename: f,
            size: `${(stats.size / 1024).toFixed(1)} KB`,
            createdAt: stats.mtime
          };
        })
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    const dbStats = fs.existsSync(dbFile) ? fs.statSync(dbFile) : null;

    res.json({
      success: true,
      data: {
        storageDrive: dataDir.slice(0, 2),
        dataDirectory: dataDir,
        databaseFile: dbFile,
        databaseSize: dbStats ? `${(dbStats.size / 1024).toFixed(1)} KB` : '0 KB',
        lastModified: dbStats ? dbStats.mtime : null,
        backupsCount: backups.length,
        backups: backups.slice(0, 15) // Recent 15
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Trigger immediate manual backup
router.post('/now', (req, res) => {
  try {
    const backupFileName = db.createBackup('manual');
    if (!backupFileName) {
      return res.status(500).json({ success: false, message: 'Failed to create backup' });
    }

    res.json({
      success: true,
      message: `Manual backup successfully created! Stored safely at E: drive.`,
      backupFileName
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get settings
router.get('/settings', (req, res) => {
  try {
    const rows = db.query("SELECT key, value FROM settings");
    const settings = {};
    rows.forEach(r => { settings[r.key] = r.value; });
    res.json({ success: true, data: settings });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update settings
router.post('/settings', (req, res) => {
  try {
    const updates = req.body;
    for (const [key, value] of Object.entries(updates)) {
      const existing = db.queryOne("SELECT key FROM settings WHERE key = ?", [key]);
      if (existing) {
        db.run("UPDATE settings SET value = ? WHERE key = ?", [value.toString(), key]);
      } else {
        db.run("INSERT INTO settings (key, value) VALUES (?, ?)", [key, value.toString()]);
      }
    }
    res.json({ success: true, message: 'Settings saved successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
