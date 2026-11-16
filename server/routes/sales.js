const express = require('express');
const router = express.Router();
const db = require('../db');

// List sales invoices
router.get('/', (req, res) => {
  try {
    const { customer_id, status, month, from_date, to_date } = req.query;
    let sql = "SELECT * FROM sales WHERE 1=1";
    const params = [];

    if (customer_id) {
      sql += " AND customer_id = ?";
      params.push(parseInt(customer_id));
    }

    if (status) {
      sql += " AND payment_status = ?";
      params.push(status);
    }

    if (month) {
      sql += " AND sale_date LIKE ?";
      params.push(`${month}%`);
    }

    if (from_date && to_date) {
      sql += " AND sale_date BETWEEN ? AND ?";
      params.push(from_date, to_date);
    }

    sql += " ORDER BY id DESC";
    const rows = db.query(sql, params);
    res.json({ success: true, count: rows.length, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Single sale invoice with items
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = db.queryOne("SELECT * FROM sales WHERE id = ?", [id]);
    if (!sale) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const items = db.query("SELECT * FROM sale_items WHERE sale_id = ?", [id]);
    const customer = db.queryOne("SELECT * FROM customers WHERE id = ?", [sale.customer_id]);
    const settingsRows = db.query("SELECT key, value FROM settings");
    const settings = {};
    settingsRows.forEach(r => { settings[r.key] = r.value; });

    res.json({
      success: true,
      data: {
        sale,
        items,
        customer,
        settings
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Create new sale invoice with company-specific dynamic rates
router.post('/', (req, res) => {
  try {
    const { customer_id, sale_date, due_date, items, discount, paid_amount, notes, save_custom_rates } = req.body;

    if (!customer_id) return res.status(400).json({ success: false, message: 'Please select a dealer/hospital' });
    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, message: 'Please add at least one surgical item to the invoice' });
    }

    const customer = db.queryOne("SELECT * FROM customers WHERE id = ?", [parseInt(customer_id)]);
    if (!customer) return res.status(404).json({ success: false, message: 'Dealer / Hospital not found' });

    const dateStr = sale_date || new Date().toISOString().slice(0, 10);
    let calculatedDueDate = due_date;
    if (!calculatedDueDate) {
      const d = new Date(dateStr);
      d.setDate(d.getDate() + (customer.pay_term_days || 30));
      calculatedDueDate = d.toISOString().slice(0, 10);
    }

    const countRow = db.queryOne("SELECT COUNT(id) AS total FROM sales");
    const invoiceNo = `INV-${dateStr.replace(/-/g, '').slice(2, 6)}-${(countRow.total + 1).toString().padStart(4, '0')}`;

    let subtotal = 0;
    let costTotal = 0;
    const validatedItems = [];

    // Verify products and calculate exact line profits
    for (const item of items) {
      const prod = db.queryOne("SELECT * FROM products WHERE id = ?", [parseInt(item.product_id)]);
      if (!prod) return res.status(404).json({ success: false, message: `Product ID ${item.product_id} not found` });

      const qty = parseFloat(item.quantity) || 1;
      const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : prod.selling_price;
      const unitCost = prod.purchase_price || 0;
      const lineTotal = qty * unitPrice;
      const lineProfit = lineTotal - (qty * unitCost);

      subtotal += lineTotal;
      costTotal += (qty * unitCost);

      validatedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: lineTotal,
        line_profit: lineProfit
      });

      // Automatically remember/save this rate for this company for future invoices
      if (save_custom_rates !== false) {
        const existingRate = db.queryOne("SELECT id FROM customer_product_prices WHERE customer_id = ? AND product_id = ?", [customer.id, prod.id]);
        if (existingRate) {
          db.run("UPDATE customer_product_prices SET custom_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [unitPrice, existingRate.id]);
        } else {
          db.run("INSERT INTO customer_product_prices (customer_id, product_id, custom_price) VALUES (?, ?, ?)", [customer.id, prod.id, unitPrice]);
        }
      }
    }

    const discountAmount = parseFloat(discount) || 0;
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const paid = parseFloat(paid_amount) || 0;
    const dueAmount = Math.max(0, totalAmount - paid);
    const profitTotal = totalAmount - costTotal;

    let paymentStatus = 'due';
    if (dueAmount <= 0) paymentStatus = 'paid';
    else if (paid > 0) paymentStatus = 'partial';

    // 1. Insert into sales
    const saleResult = db.run(`
      INSERT INTO sales (
        invoice_no, customer_id, customer_name, customer_phone, sale_date, due_date,
        subtotal, discount, total_amount, paid_amount, due_amount, cost_total, profit_total,
        payment_status, notes
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      invoiceNo, customer.id, customer.name, customer.mobile, dateStr, calculatedDueDate,
      subtotal, discountAmount, totalAmount, paid, dueAmount, costTotal, profitTotal,
      paymentStatus, notes || ''
    ]);

    const saleId = saleResult.lastInsertRowid;

    // 2. Insert items and decrement stock
    for (const vItem of validatedItems) {
      db.run(`
        INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit, quantity, unit_price, unit_cost, line_total, line_profit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        saleId, vItem.product_id, vItem.product_name, vItem.sku, vItem.unit,
        vItem.quantity, vItem.unit_price, vItem.unit_cost, vItem.line_total, vItem.line_profit
      ]);

      // Deduct stock
      db.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [vItem.quantity, vItem.product_id]);
    }

    // 3. Update customer outstanding balance
    if (dueAmount > 0) {
      db.run("UPDATE customers SET balance = balance + ? WHERE id = ?", [dueAmount, customer.id]);
    }

    // 4. Record payment if paid amount was received
    if (paid > 0) {
      db.run(`
        INSERT INTO payments (type, reference_no, contact_id, contact_name, amount, payment_date, payment_method, notes)
        VALUES ('customer_recovery', ?, ?, ?, ?, ?, 'Cash', 'Advance/Payment for Invoice #' || ?)
      `, [invoiceNo, customer.id, customer.name, paid, dateStr, invoiceNo]);
    }

    const createdSale = db.queryOne("SELECT * FROM sales WHERE id = ?", [saleId]);
    res.json({
      success: true,
      message: 'Invoice created successfully',
      data: createdSale
    });
  } catch (err) {
    console.error('Error creating sale:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Update / Edit an existing sale invoice
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const existingSale = db.queryOne("SELECT * FROM sales WHERE id = ?", [id]);
    if (!existingSale) return res.status(404).json({ success: false, message: 'Invoice not found' });

    const { customer_id, sale_date, due_date, items, discount, paid_amount, notes, save_custom_rates } = req.body;

    // 1. Fetch old items and restore their stock
    const oldItems = db.query("SELECT * FROM sale_items WHERE sale_id = ?", [id]);
    for (const old of oldItems) {
      db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [old.quantity, old.product_id]);
    }

    // 2. Reverse old customer balance
    if (existingSale.due_amount > 0) {
      db.run("UPDATE customers SET balance = MAX(0, balance - ?) WHERE id = ?", [existingSale.due_amount, existingSale.customer_id]);
    }

    // 3. Customer info
    const custId = customer_id ? parseInt(customer_id) : existingSale.customer_id;
    const customer = db.queryOne("SELECT * FROM customers WHERE id = ?", [custId]);
    if (!customer) return res.status(404).json({ success: false, message: 'Dealer / Hospital not found' });

    // 4. Validate new items
    const newItems = items && Array.isArray(items) && items.length > 0 ? items : oldItems;
    let subtotal = 0;
    let costTotal = 0;
    const validatedItems = [];

    for (const item of newItems) {
      const prod = db.queryOne("SELECT * FROM products WHERE id = ?", [parseInt(item.product_id)]);
      if (!prod) continue;

      const qty = parseFloat(item.quantity) || 1;
      const unitPrice = item.unit_price !== undefined ? parseFloat(item.unit_price) : prod.selling_price;
      const unitCost = prod.purchase_price || 0;
      const lineTotal = qty * unitPrice;
      const lineProfit = lineTotal - (qty * unitCost);

      subtotal += lineTotal;
      costTotal += (qty * unitCost);

      validatedItems.push({
        product_id: prod.id,
        product_name: prod.name,
        sku: prod.sku,
        unit: prod.unit,
        quantity: qty,
        unit_price: unitPrice,
        unit_cost: unitCost,
        line_total: lineTotal,
        line_profit: lineProfit
      });

      if (save_custom_rates !== false) {
        const existingRate = db.queryOne("SELECT id FROM customer_product_prices WHERE customer_id = ? AND product_id = ?", [customer.id, prod.id]);
        if (existingRate) {
          db.run("UPDATE customer_product_prices SET custom_price = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?", [unitPrice, existingRate.id]);
        } else {
          db.run("INSERT INTO customer_product_prices (customer_id, product_id, custom_price) VALUES (?, ?, ?)", [customer.id, prod.id, unitPrice]);
        }
      }
    }

    const discountAmount = discount !== undefined ? parseFloat(discount) : existingSale.discount;
    const totalAmount = Math.max(0, subtotal - discountAmount);
    const paid = paid_amount !== undefined ? parseFloat(paid_amount) : existingSale.paid_amount;
    const dueAmount = Math.max(0, totalAmount - paid);
    const profitTotal = totalAmount - costTotal;

    let paymentStatus = 'due';
    if (dueAmount <= 0) paymentStatus = 'paid';
    else if (paid > 0) paymentStatus = 'partial';

    const dateStr = sale_date || existingSale.sale_date;
    const calcDueDate = due_date || existingSale.due_date;

    // Update sales table
    db.run(`
      UPDATE sales SET
        customer_id = ?,
        customer_name = ?,
        customer_phone = ?,
        sale_date = ?,
        due_date = ?,
        subtotal = ?,
        discount = ?,
        total_amount = ?,
        paid_amount = ?,
        due_amount = ?,
        cost_total = ?,
        profit_total = ?,
        payment_status = ?,
        notes = ?
      WHERE id = ?
    `, [
      customer.id, customer.name, customer.mobile, dateStr, calcDueDate,
      subtotal, discountAmount, totalAmount, paid, dueAmount, costTotal, profitTotal,
      paymentStatus, notes !== undefined ? notes : existingSale.notes, id
    ]);

    // Replace sale_items and deduct stock
    db.run("DELETE FROM sale_items WHERE sale_id = ?", [id]);
    for (const vItem of validatedItems) {
      db.run(`
        INSERT INTO sale_items (sale_id, product_id, product_name, sku, unit, quantity, unit_price, unit_cost, line_total, line_profit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [
        id, vItem.product_id, vItem.product_name, vItem.sku, vItem.unit,
        vItem.quantity, vItem.unit_price, vItem.unit_cost, vItem.line_total, vItem.line_profit
      ]);

      // Deduct stock for new items
      db.run("UPDATE products SET current_stock = current_stock - ? WHERE id = ?", [vItem.quantity, vItem.product_id]);
    }

    // Update customer outstanding balance with new due amount
    if (dueAmount > 0) {
      db.run("UPDATE customers SET balance = balance + ? WHERE id = ?", [dueAmount, customer.id]);
    }

    const updatedSale = db.queryOne("SELECT * FROM sales WHERE id = ?", [id]);
    res.json({
      success: true,
      message: 'Invoice updated successfully and stock adjusted',
      data: updatedSale
    });
  } catch (err) {
    console.error('Error updating sale:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete a sale invoice and reverse stock + customer ledger
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const sale = db.queryOne("SELECT * FROM sales WHERE id = ?", [id]);
    if (!sale) return res.status(404).json({ success: false, message: 'Invoice not found' });

    // 1. Restore stock to inventory
    const items = db.query("SELECT * FROM sale_items WHERE sale_id = ?", [id]);
    for (const item of items) {
      db.run("UPDATE products SET current_stock = current_stock + ? WHERE id = ?", [item.quantity, item.product_id]);
    }

    // 2. Deduct due amount from customer balance
    if (sale.due_amount > 0) {
      db.run("UPDATE customers SET balance = MAX(0, balance - ?) WHERE id = ?", [sale.due_amount, sale.customer_id]);
    }

    // 3. Remove payment record if any
    db.run("DELETE FROM payments WHERE reference_no = ? AND contact_id = ?", [sale.invoice_no, sale.customer_id]);

    // 4. Delete sale items and sale
    db.run("DELETE FROM sale_items WHERE sale_id = ?", [id]);
    db.run("DELETE FROM sales WHERE id = ?", [id]);

    res.json({
      success: true,
      message: `Invoice ${sale.invoice_no} deleted successfully and all items restored to stock!`
    });
  } catch (err) {
    console.error('Error deleting sale:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
