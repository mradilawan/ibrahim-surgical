const express = require('express');
const router = express.Router();
const db = require('../db');

router.get('/summary', (req, res) => {
  try {
    const now = new Date();
    const currentMonthPrefix = now.toISOString().slice(0, 7); // 'YYYY-MM'

    // 1. Monthly Sales & Profit
    const monthlySalesRes = db.queryOne(`
      SELECT 
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COALESCE(SUM(profit_total), 0) AS total_profit,
        COUNT(id) AS invoice_count
      FROM sales
      WHERE sale_date LIKE ?
    `, [`${currentMonthPrefix}%`]);

    // 2. Monthly Expenses
    const monthlyExpensesRes = db.queryOne(`
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      WHERE date LIKE ?
    `, [`${currentMonthPrefix}%`]);

    // 2b. Monthly Purchases
    const monthlyPurchasesRes = db.queryOne(`
      SELECT COALESCE(SUM(total_amount), 0) AS total_purchases
      FROM purchases
      WHERE purchase_date LIKE ?
    `, [`${currentMonthPrefix}%`]);

    const netProfit = (monthlySalesRes.total_profit || 0) - (monthlyExpensesRes.total_expenses || 0);

    // 3. Total Outstanding Receivables (Dues from Hospitals)
    const duesRes = db.queryOne(`
      SELECT COALESCE(SUM(balance), 0) AS total_dues, COUNT(id) AS hospitals_with_dues
      FROM customers
      WHERE balance > 0
    `);

    // 4. Low Stock / Reorder Alert Count
    const lowStockRes = db.queryOne(`
      SELECT COUNT(id) AS low_stock_count
      FROM products
      WHERE current_stock <= alert_quantity
    `);

    // 5. Total Products Count & Stock Valuation
    const stockValuationRes = db.queryOne(`
      SELECT 
        COUNT(id) AS total_products,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock * purchase_price ELSE 0 END), 0) AS stock_cost_value,
        COALESCE(SUM(CASE WHEN current_stock > 0 THEN current_stock * selling_price ELSE 0 END), 0) AS stock_sale_value
      FROM products
    `);

    // 6. Recent Sales (Last 5)
    const recentSales = db.query(`
      SELECT id, invoice_no, customer_name, total_amount, paid_amount, due_amount, payment_status, sale_date
      FROM sales
      ORDER BY id DESC
      LIMIT 5
    `);

    // 7. Critical Low Stock Items (Top 6)
    const criticalStock = db.query(`
      SELECT id, name, sku, unit, current_stock, alert_quantity, purchase_price, selling_price
      FROM products
      WHERE current_stock <= alert_quantity
      ORDER BY (current_stock - alert_quantity) ASC
      LIMIT 6
    `);

    // 8. Top 5 Hospitals with Highest Outstanding Due
    const topDuesHospitals = db.query(`
      SELECT id, name, business_name, mobile, balance
      FROM customers
      WHERE balance > 0
      ORDER BY balance DESC
      LIMIT 5
    `);

    res.json({
      success: true,
      data: {
        month: currentMonthPrefix,
        monthlySales: monthlySalesRes.total_sales,
        monthlyGrossProfit: monthlySalesRes.total_profit,
        monthlyExpenses: monthlyExpensesRes.total_expenses,
        monthlyPurchases: monthlyPurchasesRes.total_purchases,
        monthlyNetProfit: netProfit,
        invoicesThisMonth: monthlySalesRes.invoice_count,
        totalHospitalDues: duesRes.total_dues,
        hospitalsWithDues: duesRes.hospitals_with_dues,
        lowStockCount: lowStockRes.low_stock_count,
        totalProducts: stockValuationRes.total_products,
        stockCostValue: stockValuationRes.stock_cost_value,
        stockSaleValue: stockValuationRes.stock_sale_value,
        recentSales,
        criticalStock,
        topDuesHospitals
      }
    });
  } catch (err) {
    console.error('Error fetching dashboard summary:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Chart trends (Last 6 months)
router.get('/trends', (req, res) => {
  try {
    const months = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(d.toISOString().slice(0, 7));
    }

    const trendData = months.map(m => {
      const salesRow = db.queryOne(`
        SELECT 
          COALESCE(SUM(total_amount), 0) AS sales,
          COALESCE(SUM(profit_total), 0) AS profit
        FROM sales
        WHERE sale_date LIKE ?
      `, [`${m}%`]);

      const expRow = db.queryOne(`
        SELECT COALESCE(SUM(amount), 0) AS expenses
        FROM expenses
        WHERE date LIKE ?
      `, [`${m}%`]);

      return {
        month: m,
        sales: salesRow.sales || 0,
        profit: (salesRow.profit || 0) - (expRow.expenses || 0)
      };
    });

    res.json({ success: true, data: trendData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// Dynamic Activity & Stock Flow Chart (7 days, 15 days, 1 month, 3 months)
router.get('/chart', (req, res) => {
  try {
    const range = req.query.range || '1month';
    let dayCount = 30;
    if (range === '7days') dayCount = 7;
    else if (range === '15days') dayCount = 15;
    else if (range === '1month') dayCount = 30;
    else if (range === '3months') dayCount = 90;

    // Generate list of dates from (today - dayCount + 1) to today
    const dates = [];
    const now = new Date();
    for (let i = dayCount - 1; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      dates.push(d.toISOString().slice(0, 10));
    }
    const minDate = dates[0];
    const maxDate = dates[dates.length - 1];

    // Query sales grouped by date
    const salesRows = db.query(`
      SELECT 
        sale_date, 
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COALESCE(SUM(profit_total), 0) AS total_profit,
        COUNT(id) AS invoice_count
      FROM sales
      WHERE sale_date BETWEEN ? AND ?
      GROUP BY sale_date
    `, [minDate, maxDate]);

    // Query purchases grouped by date
    const purchaseRows = db.query(`
      SELECT 
        purchase_date, 
        COALESCE(SUM(total_amount), 0) AS total_purchases,
        COUNT(id) AS purchase_count
      FROM purchases
      WHERE purchase_date BETWEEN ? AND ?
      GROUP BY purchase_date
    `, [minDate, maxDate]);

    // Build lookup maps
    const salesMap = {};
    salesRows.forEach(r => {
      salesMap[r.sale_date] = {
        sales: r.total_sales || 0,
        profit: r.total_profit || 0,
        invoices: r.invoice_count || 0
      };
    });

    const purchasesMap = {};
    purchaseRows.forEach(r => {
      purchasesMap[r.purchase_date] = {
        purchases: r.total_purchases || 0,
        purchasesCount: r.purchase_count || 0
      };
    });

    // Merge into points
    let sumSales = 0;
    let sumPurchases = 0;
    let sumProfit = 0;
    let sumInvoices = 0;
    let peakDay = { date: '', amount: 0 };

    const chartData = dates.map(dt => {
      const s = salesMap[dt] || { sales: 0, profit: 0, invoices: 0 };
      const p = purchasesMap[dt] || { purchases: 0, purchasesCount: 0 };

      sumSales += s.sales;
      sumPurchases += p.purchases;
      sumProfit += s.profit;
      sumInvoices += s.invoices;

      if (s.sales > peakDay.amount) {
        peakDay = { date: dt, amount: s.sales };
      }

      const dateParts = dt.split('-');
      const dObj = new Date(parseInt(dateParts[0]), parseInt(dateParts[1]) - 1, parseInt(dateParts[2]));
      const label = dObj.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });

      return {
        date: dt,
        label,
        sales: s.sales,
        profit: s.profit,
        invoices: s.invoices,
        purchases: p.purchases
      };
    });

    res.json({
      success: true,
      range,
      dayCount,
      summary: {
        totalSales: sumSales,
        totalPurchases: sumPurchases,
        totalProfit: sumProfit,
        totalInvoices: sumInvoices,
        avgDailySales: Math.round(sumSales / dayCount),
        peakDay
      },
      chartData
    });
  } catch (err) {
    console.error('Error generating chart data:', err);
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;
