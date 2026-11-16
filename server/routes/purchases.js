const express = require('express');
const router = express.Router();
const db = require('../db');

function formatLocalTimestamp() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

// List purchases
router.get('/', (req, res) => {
  try {
    const { supplier_id, from_date, to_date } = req.query;
    let sql = "SELECT * FROM purchases WHERE 1=1";
    const params = [];

    if (supplier_id) {
      sql += " AND supplier_id = ?";
      params.push(parseInt(supplier_id));
    }

    if (from_date && to_date) {
      sql += " AND purchase_date BETWEEN ? AND ?";
      params.push(from_date, to_date);
    }

    sql += " ORDER BY id DESC";
    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single purchase detail
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const purchase = db.queryOne("SELECT * FROM purchases WHERE id = ?", [id]);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const items = db.query(`
      SELECT pi.*, p.sku, p.unit
      FROM purchase_items pi
      LEFT JOIN products p ON pi.product_id = p.id
      WHERE pi.purchase_id = ?
    `, [id]);
    const supplier = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [purchase.supplier_id]);
    const settingsRows = db.query("SELECT key, value FROM settings");
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    res.json({ success: true, data: { purchase, items, supplier, settings } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Record new purchase
router.post('/', (req, res) => {
  try {
    const { supplier_id, purchase_date, items, paid_amount, payment_method, notes } = req.body;

    if (!supplier_id) return res.status(400).json({ success: false, message: 'Supplier is required' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Please add items to purchase' });
    }

    const supplier = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [parseInt(supplier_id)]);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const dateStr = purchase_date || new Date().toISOString().slice(0, 10);
    const countRow = db.queryOne("SELECT COUNT(id) AS total FROM purchases");
    const purchaseNo = req.body.purchase_no ? String(req.body.purchase_no).trim() : `PO-${dateStr.replace(/-/g, '').slice(2, 6)}-${(countRow.total + 1).toString().padStart(4, '0')}`;

    let totalAmount = 0;
    const validatedItems = [];

    for (const item of items) {
      const prod = db.queryOne("SELECT * FROM products WHERE id = ?", [parseInt(item.product_id)]);
      if (!prod) return res.status(404).json({ success: false, message: `Product ID ${item.product_id} not found` });

      const qty = parseFloat(item.quantity) || 1;
      const price = item.purchase_price !== undefined ? parseFloat(item.purchase_price) : prod.purchase_price;
      const lineTotal = qty * price;

      totalAmount += lineTotal;
      validatedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        quantity: qty,
        purchase_price: price,
        line_total: lineTotal
      });
    }

    const paid = parseFloat(paid_amount) || 0;
    const dueAmount = Math.max(0, totalAmount - paid);

    // 1. Insert into purchases
    const result = db.run(`
      INSERT INTO purchases (purchase_no, supplier_id, supplier_name, purchase_date, total_amount, paid_amount, due_amount, payment_method, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [purchaseNo, supplier.id, supplier.name, dateStr, totalAmount, paid, dueAmount, payment_method || 'Cash', notes || '']);

    const purchaseId = result.lastInsertRowid;

    // 2. Insert purchase items and increment stock
    for (const vItem of validatedItems) {
      db.run(`
        INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, purchase_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [purchaseId, vItem.product_id, vItem.product_name, vItem.quantity, vItem.purchase_price, vItem.line_total]);

      // Increase stock and update purchase price
      db.run(`
        UPDATE products 
        SET current_stock = current_stock + ?, purchase_price = ?
        WHERE id = ?
      `, [vItem.quantity, vItem.purchase_price, vItem.product_id]);
    }

    // 3. Update supplier balance if due
    if (dueAmount > 0) {
      db.run("UPDATE suppliers SET balance = balance + ? WHERE id = ?", [dueAmount, supplier.id]);
    }

    const created = db.queryOne("SELECT * FROM purchases WHERE id = ?", [purchaseId]);
    res.json({ success: true, message: 'Stock purchase recorded successfully', data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update purchase while keeping original bill entry date intact and stamping updated_at separately
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existing = db.queryOne("SELECT * FROM purchases WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Purchase not found' });

    const { supplier_id, purchase_no, items, paid_amount, payment_method, notes } = req.body;
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Purchase must have at least one item' });
    }

    const supId = supplier_id ? parseInt(supplier_id) : existing.supplier_id;
    const supplier = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [supId]);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const nextPurchaseNo = purchase_no && String(purchase_no).trim() ? String(purchase_no).trim() : existing.purchase_no;
    if (nextPurchaseNo !== existing.purchase_no) {
      const dup = db.queryOne("SELECT id FROM purchases WHERE purchase_no = ? AND id != ?", [nextPurchaseNo, id]);
      if (dup) return res.status(400).json({ success: false, message: 'Purchase bill # already exists' });
    }

    let totalAmount = 0;
    const validatedItems = [];
    for (const item of items) {
      const prod = db.queryOne("SELECT * FROM products WHERE id = ?", [parseInt(item.product_id)]);
      if (!prod) return res.status(404).json({ success: false, message: `Product ID ${item.product_id} not found` });

      const qty = parseFloat(item.quantity) || 0;
      if (qty <= 0) continue;
      const price = item.purchase_price !== undefined ? (parseFloat(item.purchase_price) || 0) : prod.purchase_price;
      const lineTotal = qty * price;
      totalAmount += lineTotal;

      validatedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        quantity: qty,
        purchase_price: price,
        line_total: lineTotal
      });
    }

    if (validatedItems.length === 0) {
      return res.status(400).json({ success: false, message: 'Please include at least one item with quantity > 0' });
    }

    // 1. Reverse stock added by previous version of this purchase
    const oldItems = db.query("SELECT * FROM purchase_items WHERE purchase_id = ?", [id]);
    for (const old of oldItems) {
      db.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [old.quantity, old.product_id]);
    }

    // 2. Reverse old due balance from old supplier
    if (existing.due_amount > 0) {
      db.run("UPDATE suppliers SET balance = MAX(0, balance - ?) WHERE id = ?", [existing.due_amount, existing.supplier_id]);
    }

    const paid = paid_amount !== undefined ? (parseFloat(paid_amount) || 0) : existing.paid_amount;
    const dueAmount = Math.max(0, totalAmount - paid);
    const updatedTimestamp = formatLocalTimestamp();

    // 3. Update purchase keeping original purchase_date & created_at unchanged
    db.run(`
      UPDATE purchases SET
        purchase_no = ?,
        supplier_id = ?,
        supplier_name = ?,
        total_amount = ?,
        paid_amount = ?,
        due_amount = ?,
        payment_method = ?,
        notes = ?,
        updated_at = ?
      WHERE id = ?
    `, [
      nextPurchaseNo,
      supplier.id,
      supplier.name,
      totalAmount,
      paid,
      dueAmount,
      payment_method || existing.payment_method || 'Cash',
      notes !== undefined ? notes : existing.notes,
      updatedTimestamp,
      id
    ]);

    // 4. Replace purchase items & apply updated stock + purchase price
    db.run("DELETE FROM purchase_items WHERE purchase_id = ?", [id]);
    for (const vItem of validatedItems) {
      db.run(`
        INSERT INTO purchase_items (purchase_id, product_id, product_name, quantity, purchase_price, line_total)
        VALUES (?, ?, ?, ?, ?, ?)
      `, [id, vItem.product_id, vItem.product_name, vItem.quantity, vItem.purchase_price, vItem.line_total]);

      db.run(`
        UPDATE products
        SET current_stock = current_stock + ?, purchase_price = ?
        WHERE id = ?
      `, [vItem.quantity, vItem.purchase_price, vItem.product_id]);
    }

    // 5. Add new due amount to supplier balance
    if (dueAmount > 0) {
      db.run("UPDATE suppliers SET balance = balance + ? WHERE id = ?", [dueAmount, supplier.id]);
    }

    const updated = db.queryOne("SELECT * FROM purchases WHERE id = ?", [id]);
    res.json({ success: true, message: 'Purchase updated successfully', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete purchase and reverse stock + supplier balance
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const purchase = db.queryOne("SELECT * FROM purchases WHERE id = ?", [id]);
    if (!purchase) return res.status(404).json({ success: false, message: 'Purchase not found' });

    // Deduct stock added by this purchase
    const items = db.query("SELECT * FROM purchase_items WHERE purchase_id = ?", [id]);
    for (const item of items) {
      db.run("UPDATE products SET current_stock = MAX(0, current_stock - ?) WHERE id = ?", [item.quantity, item.product_id]);
    }

    // Deduct due amount from supplier balance
    if (purchase.due_amount > 0) {
      db.run("UPDATE suppliers SET balance = MAX(0, balance - ?) WHERE id = ?", [purchase.due_amount, purchase.supplier_id]);
    }

    db.run("DELETE FROM purchase_items WHERE purchase_id = ?", [id]);
    db.run("DELETE FROM purchases WHERE id = ?", [id]);

    res.json({ success: true, message: `Purchase ${purchase.purchase_no} deleted and stock adjusted!` });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
