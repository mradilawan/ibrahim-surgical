const express = require('express');
const router = express.Router();
const db = require('../db');

// List suppliers
router.get('/', (req, res) => {
  try {
    const { search } = req.query;
    let sql = "SELECT * FROM suppliers WHERE 1=1";
    const params = [];

    if (search) {
      sql += " AND (name LIKE ? OR business_name LIKE ? OR mobile LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    sql += " ORDER BY id DESC";
    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add supplier
router.post('/', (req, res) => {
  try {
    const { name, business_name, mobile, address, balance } = req.body;
    if (!name && !business_name) {
      return res.status(400).json({ success: false, message: 'Supplier Name or Company is required' });
    }

    const finalName = name || business_name;
    const finalBiz = business_name || finalName;
    const initialBalance = parseFloat(balance) || 0;

    const result = db.run(`
      INSERT INTO suppliers (name, business_name, mobile, address, balance)
      VALUES (?, ?, ?, ?, ?)
    `, [finalName, finalBiz, mobile || '', address || '', initialBalance]);

    const created = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, message: 'Supplier added successfully', data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update supplier
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, business_name, mobile, address } = req.body;

    const existing = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Supplier not found' });

    db.run(`
      UPDATE suppliers SET
        name = ?,
        business_name = ?,
        mobile = ?,
        address = ?
      WHERE id = ?
    `, [
      name || existing.name,
      business_name || existing.business_name,
      mobile !== undefined ? mobile : existing.mobile,
      address !== undefined ? address : existing.address,
      id
    ]);

    const updated = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [id]);
    res.json({ success: true, message: 'Supplier updated successfully', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
