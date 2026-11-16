const express = require('express');
const router = express.Router();
const db = require('../db');

// Profit & Loss Report
router.get('/profit-loss', (req, res) => {
  try {
    const { month } = req.query;
    const targetMonth = month || new Date().toISOString().slice(0, 7);

    // Sales Summary
    const salesSummary = db.queryOne(`
      SELECT 
        COALESCE(SUM(total_amount), 0) AS total_revenue,
        COALESCE(SUM(cost_total), 0) AS total_cogs,
        COALESCE(SUM(profit_total), 0) AS gross_profit,
        COALESCE(SUM(discount), 0) AS total_discount,
        COUNT(id) AS total_invoices
      FROM sales
      WHERE sale_date LIKE ?
    `, [`${targetMonth}%`]);

    // Expenses Summary by Category
    const expenseBreakdown = db.query(`
      SELECT category, COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE date LIKE ?
      GROUP BY category
    `, [`${targetMonth}%`]);

    const totalExpenses = expenseBreakdown.reduce((acc, e) => acc + (e.total || 0), 0);
    const netProfit = (salesSummary.gross_profit || 0) - totalExpenses;
    const profitMargin = salesSummary.total_revenue > 0 ? ((netProfit / salesSummary.total_revenue) * 100).toFixed(2) : 0;

    res.json({
      success: true,
      data: {
        month: targetMonth,
        revenue: salesSummary.total_revenue,
        cogs: salesSummary.total_cogs,
        grossProfit: salesSummary.gross_profit,
        totalExpenses,
        netProfit,
        profitMargin: `${profitMargin}%`,
        totalInvoices: salesSummary.total_invoices,
        totalDiscount: salesSummary.total_discount,
        expenseBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Detailed Stock Report with filters
router.get('/stock', (req, res) => {
  try {
    const { status, search } = req.query;
    let sql = `
      SELECT 
        id, name, sku, category, unit, purchase_price, selling_price, current_stock, alert_quantity, location,
        CASE WHEN current_stock > 0 THEN current_stock * purchase_price ELSE 0 END AS stock_cost_value,
        CASE WHEN current_stock > 0 THEN current_stock * selling_price ELSE 0 END AS stock_sale_value,
        CASE 
          WHEN current_stock <= 0 THEN 'out_of_stock'
          WHEN current_stock <= alert_quantity THEN 'low_stock'
          ELSE 'in_stock'
        END AS stock_status
      FROM products
      WHERE 1=1
    `;
    const params = [];

    if (search) {
      sql += " AND (name LIKE ? OR sku LIKE ?)";
      params.push(`%${search}%`, `%${search}%`);
    }

    if (status === 'in_stock') {
      sql += " AND current_stock > 0";
    } else if (status === 'out_of_stock') {
      sql += " AND current_stock <= 0";
    } else if (status === 'low_stock') {
      sql += " AND current_stock > 0 AND current_stock <= alert_quantity";
    }

    sql += " ORDER BY current_stock DESC, name ASC";
    const products = db.query(sql, params);

    // Compute grand totals across all active inventory
    const summaryRow = db.queryOne(`
      SELECT 
        COUNT(id) AS total_items,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock ELSE 0 END), 0) AS total_units_in_stock,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock * purchase_price ELSE 0 END), 0) AS total_cost_value,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock * selling_price ELSE 0 END), 0) AS total_sale_value,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN 1 ELSE 0 END), 0) AS in_stock_count,
        COALESCE(SUM(CASE WHEN current_stock <= 0 THEN 1 ELSE 0 END), 0) AS out_of_stock_count,
        COALESCE(SUM(CASE WHEN current_stock > 0 AND current_stock <= alert_quantity THEN 1 ELSE 0 END), 0) AS low_stock_count
      FROM products
    `);

    const potentialProfit = (summaryRow.total_sale_value || 0) - (summaryRow.total_cost_value || 0);

    res.json({
      success: true,
      data: {
        summary: {
          totalItems: summaryRow.total_items,
          inStockCount: summaryRow.in_stock_count,
          outOfStockCount: summaryRow.out_of_stock_count,
          lowStockCount: summaryRow.low_stock_count,
          totalUnits: summaryRow.total_units_in_stock,
          totalCostValue: summaryRow.total_cost_value,
          totalSaleValue: summaryRow.total_sale_value,
          potentialProfit
        },
        products
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Hospital Dues & Receivables Aging Report
router.get('/customer-dues', (req, res) => {
  try {
    const hospitals = db.query(`
      SELECT 
        c.id, c.name, c.business_name, c.mobile, c.balance AS outstanding_due, c.pay_term_days,
        (SELECT MAX(sale_date) FROM sales WHERE customer_id = c.id) AS last_invoice_date,
        (SELECT COUNT(id) FROM sales WHERE customer_id = c.id AND payment_status != 'paid') AS unpaid_invoices_count
      FROM customers c
      WHERE c.balance > 0
      ORDER BY c.balance DESC
    `);

    const totalOutstanding = hospitals.reduce((acc, h) => acc + (h.outstanding_due || 0), 0);

    res.json({
      success: true,
      data: {
        count: hospitals.length,
        totalOutstanding,
        hospitals
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
