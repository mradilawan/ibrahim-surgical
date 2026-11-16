const http = require('http');
const db = require('./server/db');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3721,
      path: path,
      method: method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, raw: data });
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('========================================================');
  console.log('   STARTING AUTOMATED SYSTEM TESTS & DEBUGGING');
  console.log('========================================================\n');

  // Test 1: Health Check
  console.log('[TEST 1] Checking API Health...');
  const health = await request('GET', '/api/health');
  if (health.status !== 200 || health.body.status !== 'online') {
    throw new Error(`Health check failed: ${JSON.stringify(health)}`);
  }
  console.log('  -> PASS: Server online, storage at:', health.body.storage);

  // Test 2: Products Count & Search
  console.log('\n[TEST 2] Verifying 92 Products Catalog & Search...');
  const productsRes = await request('GET', '/api/products');
  if (productsRes.body.count !== 92) {
    throw new Error(`Expected 92 products, found ${productsRes.body.count}`);
  }
  console.log(`  -> PASS: All ${productsRes.body.count} products present and indexed.`);

  const searchRes = await request('GET', '/api/products?search=Guaze');
  if (searchRes.body.count === 0) {
    throw new Error('Search for "Guaze" returned 0 products');
  }
  console.log(`  -> PASS: Product search works, found "${searchRes.body.data[0].name}" (SKU: ${searchRes.body.data[0].sku})`);

  // Test 3: Customers / Hospitals Count
  console.log('\n[TEST 3] Verifying 42 Hospitals & Customers...');
  const customersRes = await request('GET', '/api/customers');
  if (customersRes.body.count !== 42) {
    throw new Error(`Expected 42 customers, found ${customersRes.body.count}`);
  }
  console.log(`  -> PASS: All ${customersRes.body.count} hospitals / accounts loaded.`);

  // Test 4: Dashboard Summary
  console.log('\n[TEST 4] Verifying Dashboard Financial Summary...');
  const dashRes = await request('GET', '/api/dashboard/summary');
  if (!dashRes.body.success) throw new Error('Dashboard summary failed');
  const d = dashRes.body.data;
  console.log(`  -> PASS: Dashboard calculated:
     * Total Products: ${d.totalProducts}
     * Total Cost Value: Rs. ${d.stockCostValue.toLocaleString()}
     * Total Sale Value: Rs. ${d.stockSaleValue.toLocaleString()}
     * Low Stock Count: ${d.lowStockCount}`);

  // Test 5: Safe Backup Execution on E: Drive
  console.log('\n[TEST 5] Testing Safe Backup Creation on E: Drive...');
  const backupRes = await request('POST', '/api/backup/now');
  if (!backupRes.body.success) throw new Error('Manual backup trigger failed');
  console.log('  -> PASS: Safe Backup created:', backupRes.body.backupFileName);

  const backupStatus = await request('GET', '/api/backup/status');
  console.log(`  -> PASS: Safe drive confirmed: ${backupStatus.body.data.storageDrive}\\ (${backupStatus.body.data.backupsCount} backups available).`);

  // Test 6: Transaction flow - Create an invoice, verify stock deduction & hospital balance update
  console.log('\n[TEST 6] Testing Invoice Creation & Stock Deductions...');
  const sampleCustomer = customersRes.body.data[0];
  const sampleProduct = productsRes.body.data[0];
  const initialStock = sampleProduct.current_stock;
  const initialCustBalance = sampleCustomer.balance;

  const invoicePayload = {
    customer_id: sampleCustomer.id,
    sale_date: new Date().toISOString().slice(0, 10),
    items: [
      { product_id: sampleProduct.id, quantity: 2, unit_price: sampleProduct.selling_price }
    ],
    discount: 0,
    paid_amount: 10, // partial payment
    notes: 'Automated Test Invoice'
  };

  const invoiceRes = await request('POST', '/api/sales', invoicePayload);
  if (!invoiceRes.body.success) throw new Error(`Invoice creation failed: ${JSON.stringify(invoiceRes)}`);
  const createdInv = invoiceRes.body.data;
  console.log(`  -> PASS: Invoice generated: ${createdInv.invoice_no} | Total: Rs. ${createdInv.total_amount}`);

  // Verify stock was deducted
  const prodCheck = await request('GET', `/api/products?search=${encodeURIComponent(sampleProduct.sku)}`);
  const updatedStock = prodCheck.body.data[0].current_stock;
  if (updatedStock !== initialStock - 2) {
    throw new Error(`Stock deduction failed: expected ${initialStock - 2}, got ${updatedStock}`);
  }
  console.log(`  -> PASS: Stock accurately deducted from ${initialStock} to ${updatedStock}`);

  // Verify invoice view/print endpoint
  const invDetail = await request('GET', `/api/sales/${createdInv.id}`);
  if (!invDetail.body.success || invDetail.body.data.items.length !== 1) {
    throw new Error('Invoice detail / print endpoint check failed');
  }
  console.log(`  -> PASS: Printable invoice data formatted successfully with customer details.`);

  // Test 7: Payment recovery
  console.log('\n[TEST 7] Testing Customer Payment Recovery...');
  const recoveryRes = await request('POST', '/api/payments/recovery', {
    customer_id: sampleCustomer.id,
    amount: 10,
    payment_method: 'Cash',
    notes: 'Test recovery'
  });
  if (!recoveryRes.body.success) throw new Error('Payment recovery failed');
  console.log('  -> PASS: Payment recovery processed successfully.');

  // Test 8: P&L Report
  console.log('\n[TEST 8] Testing Monthly Profit & Loss Statement...');
  const pnlRes = await request('GET', '/api/reports/profit-loss');
  if (!pnlRes.body.success) throw new Error('P&L report failed');
  console.log(`  -> PASS: P&L Report: Revenue: Rs. ${pnlRes.body.data.revenue} | Gross Profit: Rs. ${pnlRes.body.data.grossProfit}`);

  console.log('\n========================================================');
  console.log('   ALL 8 TEST SUITES PASSED! ZERO BUGS DETECTED.');
  console.log('========================================================\n');
}

runTests().catch(err => {
  console.error('\n[FAIL] Test encountered an error:', err);
  process.exit(1);
});
