const express = require('express');
const router = express.Router();
const db = require('../db');

// List products with optional search and filters
router.get('/', (req, res) => {
  try {
    const { search, category, low_stock, sort } = req.query;
    let sql = "SELECT * FROM products WHERE 1=1";
    const params = [];

    if (search) {
      sql += " AND (name LIKE ? OR sku LIKE ? OR category LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (category) {
      sql += " AND category = ?";
      params.push(category);
    }

    if (low_stock === 'true') {
      sql += " AND current_stock <= alert_quantity";
    }

    if (sort === 'stock_asc') {
      sql += " ORDER BY current_stock ASC";
    } else if (sort === 'stock_desc') {
      sql += " ORDER BY current_stock DESC";
    } else if (sort === 'name') {
      sql += " ORDER BY name ASC";
    } else {
      sql += " ORDER BY id DESC";
    }

    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Reorder alerts list (items requiring order this month)
router.get('/reorder-list', (req, res) => {
  try {
    const rows = db.query(`
      SELECT 
        id, name, sku, unit, purchase_price, selling_price, current_stock, alert_quantity,
        (alert_quantity - current_stock) AS needed_quantity,
        ((alert_quantity - current_stock) * purchase_price) AS estimated_reorder_cost
      FROM products
      WHERE current_stock <= alert_quantity
      ORDER BY (current_stock - alert_quantity) ASC
    `);

    const totalEstimatedCost = rows.reduce((acc, item) => acc + (item.estimated_reorder_cost > 0 ? item.estimated_reorder_cost : 0), 0);

    res.json({
      success: true,
      count: rows.length,
      totalEstimatedCost,
      data: rows
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add new product
router.post('/', (req, res) => {
  try {
    const { name, sku, category, unit, purchase_price, selling_price, discount_type, discount_value, current_stock, alert_quantity, location } = req.body;
    const cleanName = (name || '').toString().trim();
    if (!cleanName) return res.status(400).json({ success: false, message: 'Product name is required' });

    const trimmedSku = (sku || '').toString().trim();
    const finalSku = trimmedSku || `PRD-${Date.now().toString().slice(-6)}`;
    const cost = parseFloat(purchase_price) || 0;
    const sell = parseFloat(selling_price) || 0;
    const discType = discount_type === 'pct' ? 'pct' : 'rs';
    const discVal = Math.max(0, parseFloat(discount_value) || 0);
    const stock = parseFloat(current_stock) || 0;
    const alert = alert_quantity !== undefined && alert_quantity !== '' ? (parseFloat(alert_quantity) || 0) : 10;
    const cat = category || 'Surgical Supplies';
    const u = (unit || '').toString().trim() || 'Pieces';
    const loc = location || 'Operation Theater / Main Store';

    // Check SKU duplicate
    const existing = db.queryOne("SELECT id FROM products WHERE sku = ?", [finalSku]);
    if (existing) {
      return res.status(400).json({ success: false, message: 'SKU code already exists' });
    }

    const result = db.run(`
      INSERT INTO products (name, sku, category, unit, purchase_price, selling_price, discount_type, discount_value, current_stock, alert_quantity, location)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [cleanName, finalSku, cat, u, cost, sell, discType, discVal, stock, alert, loc]);

    const created = db.queryOne("SELECT * FROM products WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, message: 'Product added successfully', data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update product
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, sku, category, unit, purchase_price, selling_price, discount_type, discount_value, current_stock, alert_quantity, location } = req.body;

    const existing = db.queryOne("SELECT * FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    const nextName = name !== undefined ? name.toString().trim() : existing.name;
    if (!nextName) return res.status(400).json({ success: false, message: 'Product name is required' });

    const nextSku = sku !== undefined && sku.toString().trim() ? sku.toString().trim() : existing.sku;
    if (nextSku !== existing.sku) {
      const dup = db.queryOne("SELECT id FROM products WHERE sku = ? AND id != ?", [nextSku, id]);
      if (dup) return res.status(400).json({ success: false, message: 'SKU code already exists' });
    }

    const nextDiscType = discount_type !== undefined ? (discount_type === 'pct' ? 'pct' : 'rs') : (existing.discount_type || 'rs');
    const nextDiscVal = discount_value !== undefined ? Math.max(0, parseFloat(discount_value) || 0) : (existing.discount_value || 0);

    db.run(`
      UPDATE products SET
        name = ?,
        sku = ?,
        category = ?,
        unit = ?,
        purchase_price = ?,
        selling_price = ?,
        discount_type = ?,
        discount_value = ?,
        current_stock = ?,
        alert_quantity = ?,
        location = ?,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      nextName,
      nextSku,
      category || existing.category,
      (unit !== undefined && unit.toString().trim()) ? unit.toString().trim() : existing.unit,
      purchase_price !== undefined ? (parseFloat(purchase_price) || 0) : existing.purchase_price,
      selling_price !== undefined ? (parseFloat(selling_price) || 0) : existing.selling_price,
      nextDiscType,
      nextDiscVal,
      current_stock !== undefined ? (parseFloat(current_stock) || 0) : existing.current_stock,
      alert_quantity !== undefined ? (parseFloat(alert_quantity) || 0) : existing.alert_quantity,
      location || existing.location,
      id
    ]);

    const updated = db.queryOne("SELECT * FROM products WHERE id = ?", [id]);
    res.json({ success: true, message: 'Product updated successfully', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete product
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.queryOne("SELECT id FROM products WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Product not found' });

    db.run("DELETE FROM customer_product_prices WHERE product_id = ?", [id]);
    db.run("DELETE FROM products WHERE id = ?", [id]);
    res.json({ success: true, message: 'Product deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
