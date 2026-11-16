const db = require('./server/db');

async function clean() {
  await db.initDb();
  // Delete all products and re-import exactly 92
  db.run("DELETE FROM products");
  db.run("DELETE FROM sqlite_sequence WHERE name='products'");
  console.log('Cleared products table.');
}

clean().then(() => {
  const { seedData } = require('./server/seeder');
  return seedData();
}).then(() => {
  const count = db.queryOne("SELECT COUNT(*) AS count FROM products");
  console.log('Final clean products count:', count.count);
  process.exit(0);
});
