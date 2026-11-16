const db = require('./server/db');

async function resetTransactions() {
  await db.initDb();
  db.run("DELETE FROM sales");
  db.run("DELETE FROM sale_items");
  db.run("DELETE FROM purchases");
  db.run("DELETE FROM purchase_items");
  db.run("DELETE FROM payments");
  db.run("DELETE FROM expenses");
  db.run("DELETE FROM sqlite_sequence WHERE name IN ('sales', 'sale_items', 'purchases', 'purchase_items', 'payments', 'expenses')");
  console.log('Transactions cleared. Database in fresh clean state.');
}

resetTransactions().then(() => {
  process.exit(0);
});
