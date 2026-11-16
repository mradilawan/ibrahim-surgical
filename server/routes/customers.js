const express = require('express');
const router = express.Router();
const db = require('../db');

// List customers/dealers
router.get('/', (req, res) => {
  try {
    const { search, with_dues } = req.query;
    let sql = "SELECT * FROM customers WHERE 1=1";
    const params = [];

    if (search) {
      sql += " AND (name LIKE ? OR business_name LIKE ? OR mobile LIKE ? OR contact_id LIKE ?)";
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    if (with_dues === 'true') {
      sql += " AND balance > 0";
    }

    sql += " ORDER BY balance DESC, id DESC";
    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single customer detail + ledger history
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const customer = db.queryOne("SELECT * FROM customers WHERE id = ?", [id]);
    if (!customer) return res.status(404).json({ success: false, message: 'Hospital / Dealer not found' });

    // Recent invoices
    const sales = db.query(`
      SELECT id, invoice_no, sale_date, due_date, total_amount, paid_amount, due_amount, payment_status
      FROM sales
      WHERE customer_id = ?
      ORDER BY id DESC
    `, [id]);

    // Payment recoveries
    const payments = db.query(`
      SELECT id, reference_no, amount, payment_date, payment_method, notes
      FROM payments
      WHERE type = 'customer_recovery' AND contact_id = ?
      ORDER BY id DESC
    `, [id]);

    // Custom price list for this customer
    const customRates = db.query(`
      SELECT cpp.product_id, cpp.custom_price, p.name AS product_name, p.sku, p.unit, p.selling_price AS default_price, p.purchase_price AS cost_price
      FROM customer_product_prices cpp
      JOIN products p ON cpp.product_id = p.id
      WHERE cpp.customer_id = ?
      ORDER BY p.name ASC
    `, [id]);

    res.json({
      success: true,
      data: {
        customer,
        sales,
        payments,
        customRates
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Get custom rates list for this customer
router.get('/:id/rates', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const rows = db.query(`
      SELECT cpp.product_id, cpp.custom_price, p.name AS product_name, p.sku, p.unit, p.selling_price AS default_price
      FROM customer_product_prices cpp
      JOIN products p ON cpp.product_id = p.id
      WHERE cpp.customer_id = ?
    `, [id]);

    const rateMap = {};
    rows.forEach(r => {
      rateMap[r.product_id] = r.custom_price;
    });

    res.json({ success: true, data: { list: rows, map: rateMap } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update or set a custom product rate for this customer
router.post('/:id/rates', (req, res) => {
  try {
    const customerId = parseInt(req.params.id);
    const { product_id, custom_price } = req.body;
    if (!product_id || custom_price === undefined) {
      return res.status(400).json({ success: false, message: 'Product ID and custom price are required' });
    }

    const price = parseFloat(custom_price);
    const existing = db.queryOne("SELECT id FROM customer_product_prices WHERE customer_id = ? AND product_id = ?", [customerId, parseInt(product_id)]);

    if (existing) {
      db.run("UPDATE customer_product_prices SET custom_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [price, existing.id]);
    } else {
      db.run("INSERT INTO customer_product_prices (customer_id, product_id, custom_price) VALUES (?, ?, ?)", [customerId, parseInt(product_id), price]);
    }

    res.json({ success: true, message: 'Custom rate saved for this company' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Add customer
router.post('/', (req, res) => {
  try {
    const { name, business_name, mobile, address, credit_limit, balance, pay_term_days } = req.body;
    if (!name && !business_name) {
      return res.status(400).json({ success: false, message: 'Dealer or Hospital name is required' });
    }

    const contactId = `CO-${Date.now().toString().slice(-6)}`;
    const finalName = name || business_name;
    const finalBiz = business_name || finalName;
    const initialBalance = parseFloat(balance) || 0;
    const limit = parseFloat(credit_limit) || 0;
    const term = parseInt(pay_term_days) || 30;

    const result = db.run(`
      INSERT INTO customers (contact_id, name, business_name, mobile, address, credit_limit, balance, pay_term_days)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `, [contactId, finalName, finalBiz, mobile || '', address || '', limit, initialBalance, term]);

    const created = db.queryOne("SELECT * FROM customers WHERE id = ?", [result.lastInsertRowid]);
    res.json({ success: true, message: 'Dealer / Hospital added successfully', data: created });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update customer
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { name, business_name, mobile, address, credit_limit, pay_term_days, balance } = req.body;

    const existing = db.queryOne("SELECT * FROM customers WHERE id = ?", [id]);
    if (!existing) return res.status(404).json({ success: false, message: 'Customer not found' });

    db.run(`
      UPDATE customers SET
        name = ?,
        business_name = ?,
        mobile = ?,
        address = ?,
        credit_limit = ?,
        pay_term_days = ?,
        balance = ?
      WHERE id = ?
    `, [
      name || existing.name,
      business_name || existing.business_name,
      mobile !== undefined ? mobile : existing.mobile,
      address !== undefined ? address : existing.address,
      credit_limit !== undefined ? parseFloat(credit_limit) : existing.credit_limit,
      pay_term_days !== undefined ? parseInt(pay_term_days) : existing.pay_term_days,
      balance !== undefined ? parseFloat(balance) : existing.balance,
      id
    ]);

    const updated = db.queryOne("SELECT * FROM customers WHERE id = ?", [id]);
    res.json({ success: true, message: 'Dealer / Hospital updated successfully', data: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete customer
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    db.run("DELETE FROM customer_product_prices WHERE customer_id = ?", [id]);
    db.run("DELETE FROM customers WHERE id = ?", [id]);
    res.json({ success: true, message: 'Dealer deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
