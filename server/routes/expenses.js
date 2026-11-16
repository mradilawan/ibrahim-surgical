const express = require('express');
const router = express.Router();
const db = require('../db');

// List expenses
router.get('/', (req, res) => {
  try {
    const { month, category, from_date, to_date } = req.query;
    let sql = "SELECT * FROM expenses WHERE 1=1";
    const params = [];

    if (month) {
      sql += " AND date LIKE ?";
      params.push(`${month}%`);
    }

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    if (from_date && to_date) {
      sql += " AND date BETWEEN ? AND ?";
      params.push(from_date, to_date);
    }

    sql += " ORDER BY date DESC, id DESC";
    const rows = db.query(sql, params);
    const totalAmount = rows.reduce((acc, r) => acc + (r.amount || 0), 0);

    res.json({ success: true, count: rows.length, totalAmount, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add expense
router.post('/', (req, res) => {
  try {
    const { category, title, amount, date, notes } = req.body;
    if (!title || !amount) {
      return res.status(400).json({ success: false, message: 'Expense title and amount are required' });
    }

    const cost = parseFloat(amount) || 0;
    const dateStr = date || new Date().toISOString().slice(0, 10);
    const cat = category || 'General';

    const result = db.run(`
      INSERT INTO expenses (category, title, amount, date, notes)
      VALUES (?, ?, ?, ?, ?)
    `, [cat, title, cost, dateStr, notes || '']);

    const created = db.queryOne("SELECT * FROM expenses WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, message: 'Expense added successfully', data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete expense
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.run("DELETE FROM expenses WHERE id = ?", [id]);
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
