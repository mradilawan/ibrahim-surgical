const db = require('./server/db');

async function updateSchemaAndCleanSuppliers() {
  await db.initDb();

  // 1. Delete all pre-seeded suppliers so user can add fresh
  db.run("DELETE FROM suppliers");
  db.run("DELETE FROM sqlite_sequence WHERE name = 'suppliers'");
  console.log('Suppliers cleared. Total suppliers now: 0');

  // 2. Ensure customers is also 0
  db.run("DELETE FROM customers");
  db.run("DELETE FROM sqlite_sequence WHERE name = 'customers'");

  // 3. Create table for Hospital/Company specific product prices
  db.run(`
    CREATE TABLE IF NOT EXISTS customer_product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      custom_price REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, product_id)
    );
  `);
  console.log('Created customer_product_prices table.');

  db.saveDb();
  db.createBackup('company_pricing_update');

  const pCount = db.queryOne("SELECT COUNT(*) AS count FROM products");
  const sCount = db.queryOne("SELECT COUNT(*) AS count FROM suppliers");
  const cCount = db.queryOne("SELECT COUNT(*) AS count FROM customers");

  console.log(`Products in DB: ${pCount.count} | Suppliers: ${sCount.count} | Customers/Dealers: ${cCount.count}`);
}

updateSchemaAndCleanSuppliers().then(() => {
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
