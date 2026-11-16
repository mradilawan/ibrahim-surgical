const fs = require('fs');
const path = require('path');
const db = require('./db');

function parseCleanJson(filePath) {
  if (!fs.existsSync(filePath)) return [];
  let content = fs.readFileSync(filePath, 'utf8');
  content = content.replace(/^\uFEFF/, '').trim();
  try {
    return JSON.parse(content);
  } catch (e) {
    console.error('Error parsing JSON from', filePath, e);
    return [];
  }
}

function cleanNumber(val) {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : val;
  const match = val.toString().replace(/<[^>]+>/g, '').match(/[-+]?[0-9]*\.?[0-9]+/);
  return match ? parseFloat(match[0]) : 0;
}

async function seedData() {
  await db.initDb();

  const dataDir = path.join(__dirname, '..', 'imported_data');

  // 1. Seed Products if empty (rates preserved, stock starts at 0)
  const existingProductsCount = db.queryOne("SELECT COUNT(*) AS count FROM products");
  if (existingProductsCount.count === 0) {
    console.log('Seeding initial 92 products with rate list (stock initialized to 0)...');
    const products = parseCleanJson(path.join(dataDir, 'products.json'));
    let pCount = 0;

    for (const p of products) {
      const name = (p.product || 'Unnamed Product').trim();
      let sku = (p.sku || `SKU-${Date.now()}-${pCount}`).trim();
      const unit = (p.unit || 'Pieces').trim();
      const cost = cleanNumber(p.min_purchase_price || p.purchase_price);
      const sell = cleanNumber(p.min_price || p.selling_price);
      const stock = 0; // Quantities reset to 0 per user requirement
      const alert = cleanNumber(p.alert_quantity) || 10;
      const category = (p.category || 'Surgical Supplies').trim() || 'Surgical Supplies';
      const loc = (p.product_locations || 'Operation Theater / Main Store').trim();

      let existing = db.queryOne("SELECT id FROM products WHERE sku = ?", [sku]);
      if (existing) {
        sku = `${sku}-V${pCount}`;
      }

      try {
        db.run(`
          INSERT INTO products (name, sku, category, unit, purchase_price, selling_price, current_stock, alert_quantity, location)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `, [name, sku, category, unit, cost, sell, stock, alert, loc]);
        pCount++;
      } catch (err) {
        console.warn(`Error adding product: ${name}`, err.message);
      }
    }
    console.log(`[SEED] Initialized ${pCount} products with zero starting stock.`);
  }

  // Dealers/Customers: Not pre-seeded, user will add their own dealers
  // Suppliers: Seeded if empty
  const existingSuppliersCount = db.queryOne("SELECT COUNT(*) AS count FROM suppliers");
  if (existingSuppliersCount.count === 0) {
    const suppliers = parseCleanJson(path.join(dataDir, 'suppliers.json'));
    for (const s of suppliers) {
      let name = (s.name || '').trim();
      let biz = (s.supplier_business_name || '').trim();
      if (!name && !biz) {
        if (s.mobile) biz = `Supplier ${s.mobile}`;
        else continue;
      }
      if (!name) name = biz;

      const mobile = (s.mobile || '').trim();
      const address = (s.address || s.address_line_1 || '').trim();

      try {
        db.run(`
          INSERT INTO suppliers (name, business_name, mobile, address)
          VALUES (?, ?, ?, ?)
        `, [name, biz, mobile, address]);
      } catch (err) {}
    }
  }
}

module.exports = { seedData };
