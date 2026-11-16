const express = require('express');
const router = express.Router();
const db = require('../db');

// List payments
router.get('/', (req, res) => {
  try {
    const { type, contact_id, month } = req.query;
    let sql = "SELECT * FROM payments WHERE 1=1";
    const params = [];

    if (type) {
      sql += " AND type = ?";
      params.push(type);
    }

    if (contact_id) {
      sql += " AND contact_id = ?";
      params.push(parseInt(contact_id));
    }

    if (month) {
      sql += " AND payment_date LIKE ?";
      params.push(`${month}%`);
    }

    sql += " ORDER BY id DESC";
    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Record customer/hospital payment recovery
router.post('/recovery', (req, res) => {
  try {
    const { customer_id, amount, payment_date, payment_method, notes } = req.body;
    if (!customer_id) return res.status(400).json({ success: false, message: 'Please select a hospital/customer' });

    const customer = db.queryOne("SELECT * FROM customers WHERE id = ?", [parseInt(customer_id)]);
    if (!customer) return res.status(404).json({ success: false, message: 'Customer not found' });

    const recoveryAmount = parseFloat(amount) || 0;
    if (recoveryAmount <= 0) return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });

    const dateStr = payment_date || new Date().toISOString().slice(0, 10);
    const refNo = `REC-${dateStr.replace(/-/g, '').slice(2, 6)}-${Date.now().toString().slice(-4)}`;

    // 1. Record payment
    const result = db.run(`
      INSERT INTO payments (type, reference_no, contact_id, contact_name, amount, payment_date, payment_method, notes)
      VALUES ('customer_recovery', ?, ?, ?, ?, ?, ?, ?)
    `, [refNo, customer.id, customer.name, recoveryAmount, dateStr, payment_method || 'Cash', notes || 'Bill Recovery']);

    // 2. Reduce customer's outstanding balance
    db.run("UPDATE customers SET balance = balance - ? WHERE id = ?", [recoveryAmount, customer.id]);

    const updatedCustomer = db.queryOne("SELECT * FROM customers WHERE id = ?", [customer.id]);
    res.json({
      success: true,
      message: `Successfully received ${recoveryAmount} PKR from ${customer.name}. New balance: ${updatedCustomer.balance} PKR`,
      data: {
        paymentId: result.lastInsertRowid,
        reference_no: refNo,
        amount: recoveryAmount,
        new_balance: updatedCustomer.balance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Record payment to supplier
router.post('/supplier', (req, res) => {
  try {
    const { supplier_id, amount, payment_date, payment_method, notes } = req.body;
    if (!supplier_id) return res.status(400).json({ success: false, message: 'Please select a supplier' });

    const supplier = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [parseInt(supplier_id)]);
    if (!supplier) return res.status(404).json({ success: false, message: 'Supplier not found' });

    const payAmount = parseFloat(amount) || 0;
    if (payAmount <= 0) return res.status(400).json({ success: false, message: 'Payment amount must be greater than 0' });

    const dateStr = payment_date || new Date().toISOString().slice(0, 10);
    const refNo = `SPAY-${dateStr.replace(/-/g, '').slice(2, 6)}-${Date.now().toString().slice(-4)}`;

    // 1. Record payment
    const result = db.run(`
      INSERT INTO payments (type, reference_no, contact_id, contact_name, amount, payment_date, payment_method, notes)
      VALUES ('supplier_payment', ?, ?, ?, ?, ?, ?, ?)
    `, [refNo, supplier.id, supplier.name, payAmount, dateStr, payment_method || 'Cash', notes || 'Payment to Supplier']);

    // 2. Reduce supplier balance
    db.run("UPDATE suppliers SET balance = balance - ? WHERE id = ?", [payAmount, supplier.id]);

    const updatedSupplier = db.queryOne("SELECT * FROM suppliers WHERE id = ?", [supplier.id]);
    res.json({
      success: true,
      message: `Successfully paid ${payAmount} PKR to ${supplier.name}. New balance: ${updatedSupplier.balance} PKR`,
      data: {
        paymentId: result.lastInsertRowid,
        reference_no: refNo,
        amount: payAmount,
        new_balance: updatedSupplier.balance
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
