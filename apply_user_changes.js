const db = require('./server/db');

async function updateData() {
  await db.initDb();

  // 1. Reset all product stocks to 0, keeping all 92 items, rates, SKUs, and units
  db.run("UPDATE products SET current_stock = 0");
  console.log('Reset all product quantities to 0.');

  // 2. Remove all 42 pre-seeded customers/dealers
  db.run("DELETE FROM customers");
  db.run("DELETE FROM sqlite_sequence WHERE name = 'customers'");
  console.log('Removed all 42 pre-seeded dealers/customers.');

  // 3. Clear any dummy/test transactions
  db.run("DELETE FROM sales");
  db.run("DELETE FROM sale_items");
  db.run("DELETE FROM payments");
  db.run("DELETE FROM purchases");
  db.run("DELETE FROM purchase_items");
  db.run("DELETE FROM expenses");
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('sales', 'sale_items', 'payments', 'purchases', 'purchase_items', 'expenses')");

  db.saveDb();
  db.createBackup('cleaned_data');

  const prodCount = db.queryOne("SELECT COUNT(*) AS count, SUM(current_stock) AS total_stock FROM products");
  const custCount = db.queryOne("SELECT COUNT(*) AS count FROM customers");

  console.log(`Products in DB: ${prodCount.count} | Total Stock: ${prodCount.total_stock}`);
  console.log(`Customers in DB: ${custCount.count}`);
}

updateData().then(() => {
  console.log('Database updated successfully.');
  process.exit(0);
}).catch(err => {
  console.error(err);
  process.exit(1);
});
