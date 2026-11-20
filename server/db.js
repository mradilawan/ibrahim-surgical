const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Safe storage location rule: strictly on E: drive (or D: if E: not found, NEVER C:)
function resolveDataDir() {
  if (process.env.VERCEL) {
    const vercelData = '/tmp';
    const seedDb = path.join(__dirname, '..', 'safe_data', 'ibrahim_surgical.sqlite');
    const targetDb = path.join(vercelData, 'ibrahim_surgical.sqlite');
    if (!fs.existsSync(targetDb) && fs.existsSync(seedDb)) {
      try {
        fs.copyFileSync(seedDb, targetDb);
      } catch (err) {
        console.warn('Could not seed Vercel database from safe_data:', err);
      }
    }
    return vercelData;
  }

  if (process.env.DATA_DIR) {
    if (!fs.existsSync(process.env.DATA_DIR)) {
      fs.mkdirSync(process.env.DATA_DIR, { recursive: true });
    }
    return process.env.DATA_DIR;
  }

  const primaryDrive = 'E:\\Ibrahim_Surgical_Data';
  const fallbackDrive = 'D:\\Ibrahim_Surgical_Data';

  try {
    if (fs.existsSync('E:\\')) {
      if (!fs.existsSync(primaryDrive)) {
        fs.mkdirSync(primaryDrive, { recursive: true });
      }
      return primaryDrive;
    }
  } catch (e) {
    console.warn('Could not access E drive, checking D drive...');
  }

  try {
    if (fs.existsSync('D:\\')) {
      if (!fs.existsSync(fallbackDrive)) {
        fs.mkdirSync(fallbackDrive, { recursive: true });
      }
      return fallbackDrive;
    }
  } catch (e) {
    console.warn('Could not access D drive...');
  }

  // If neither E nor D, use Documents non-system path
  const localDir = path.join(__dirname, '..', 'safe_data');
  if (!fs.existsSync(localDir)) {
    fs.mkdirSync(localDir, { recursive: true });
  }
  return localDir;
}

const DATA_DIR = resolveDataDir();
const DB_FILE = path.join(DATA_DIR, 'ibrahim_surgical.sqlite');
const BACKUP_DIR = path.join(DATA_DIR, 'backups');

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

let dbInstance = null;
let SQL = null;

// Save current memory database state to disk
function saveDb() {
  if (!dbInstance) return;
  try {
    const data = dbInstance.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(DB_FILE, buffer);
  } catch (err) {
    console.error('Error saving SQLite database to disk:', err);
  }
}

// Perform automated backup
function createBackup(reason = 'auto') {
  if (!fs.existsSync(DB_FILE)) return null;
  try {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const backupFileName = `backup_${timestamp}_${reason}.sqlite`;
    const backupPath = path.join(BACKUP_DIR, backupFileName);

    fs.copyFileSync(DB_FILE, backupPath);
    console.log(`[BACKUP] Created safe backup at: ${backupPath}`);

    // Prune backups older than 30 files
    const backups = fs.readdirSync(BACKUP_DIR)
      .filter(f => f.endsWith('.sqlite'))
      .map(f => ({ name: f, time: fs.statSync(path.join(BACKUP_DIR, f)).mtime.getTime() }))
      .sort((a, b) => b.time - a.time);

    if (backups.length > 30) {
      backups.slice(30).forEach(b => {
        try { fs.unlinkSync(path.join(BACKUP_DIR, b.name)); } catch (e) {}
      });
    }

    return backupFileName;
  } catch (err) {
    console.error('Error creating backup:', err);
    return null;
  }
}

// Helper query wrappers for sql.js
function query(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized');
  const stmt = dbInstance.prepare(sql);
  if (params && params.length > 0) {
    stmt.bind(params);
  }
  const results = [];
  while (stmt.step()) {
    results.push(stmt.getAsObject());
  }
  stmt.free();
  return results;
}

function queryOne(sql, params = []) {
  const rows = query(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

function run(sql, params = []) {
  if (!dbInstance) throw new Error('Database not initialized');
  dbInstance.run(sql, params);
  saveDb();
  // Get last inserted id and rows modified
  const lastIdRes = query("SELECT last_insert_rowid() AS id");
  const lastInsertId = lastIdRes.length > 0 ? lastIdRes[0].id : 0;
  return { lastInsertRowid: lastInsertId };
}

// Initialize SQLite Schema
async function initDb() {
  if (dbInstance) return dbInstance;

  SQL = await initSqlJs();

  if (fs.existsSync(DB_FILE)) {
    console.log(`Loading existing database from ${DB_FILE}...`);
    const fileBuffer = fs.readFileSync(DB_FILE);
    dbInstance = new SQL.Database(fileBuffer);
    // Create automatic startup backup
    createBackup('startup');
  } else {
    console.log(`Creating fresh database at ${DB_FILE}...`);
    dbInstance = new SQL.Database();
  }

  // Create tables
  dbInstance.run(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS suppliers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      business_name TEXT,
      mobile TEXT,
      address TEXT,
      balance REAL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id TEXT,
      name TEXT NOT NULL,
      business_name TEXT,
      mobile TEXT,
      address TEXT,
      credit_limit REAL DEFAULT 0,
      balance REAL DEFAULT 0,
      pay_term_days INTEGER DEFAULT 30,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      category TEXT DEFAULT 'General',
      unit TEXT DEFAULT 'Pieces',
      purchase_price REAL DEFAULT 0,
      selling_price REAL DEFAULT 0,
      discount_type TEXT DEFAULT 'rs',
      discount_value REAL DEFAULT 0,
      current_stock REAL DEFAULT 0,
      alert_quantity REAL DEFAULT 10,
      location TEXT DEFAULT 'Operation Theater / Main Store',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_no TEXT UNIQUE,
      supplier_id INTEGER,
      supplier_name TEXT,
      purchase_date DATE,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      due_amount REAL DEFAULT 0,
      payment_method TEXT DEFAULT 'Cash',
      notes TEXT,
      updated_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS purchase_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_id INTEGER,
      product_id INTEGER,
      product_name TEXT,
      quantity REAL,
      purchase_price REAL,
      line_total REAL
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_no TEXT UNIQUE,
      customer_id INTEGER,
      customer_name TEXT,
      customer_phone TEXT,
      sale_date DATE,
      due_date DATE,
      subtotal REAL DEFAULT 0,
      discount REAL DEFAULT 0,
      total_amount REAL DEFAULT 0,
      paid_amount REAL DEFAULT 0,
      due_amount REAL DEFAULT 0,
      cost_total REAL DEFAULT 0,
      profit_total REAL DEFAULT 0,
      payment_status TEXT DEFAULT 'due',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER,
      product_id INTEGER,
      product_name TEXT,
      sku TEXT,
      unit TEXT,
      quantity REAL,
      unit_price REAL,
      unit_cost REAL,
      line_total REAL,
      line_profit REAL
    );

    CREATE TABLE IF NOT EXISTS payments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT, -- 'customer_recovery' or 'supplier_payment'
      reference_no TEXT,
      contact_id INTEGER,
      contact_name TEXT,
      amount REAL,
      payment_date DATE,
      payment_method TEXT DEFAULT 'Cash',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      category TEXT,
      title TEXT NOT NULL,
      amount REAL NOT NULL,
      date DATE,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customer_product_prices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      custom_price REAL NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(customer_id, product_id)
    );
  `);

  // Migrate optional product discount columns for existing databases
  const productCols = query("PRAGMA table_info(products)").map(c => c.name);
  if (!productCols.includes('discount_type')) {
    dbInstance.run("ALTER TABLE products ADD COLUMN discount_type TEXT DEFAULT 'rs'");
  }
  if (!productCols.includes('discount_value')) {
    dbInstance.run("ALTER TABLE products ADD COLUMN discount_value REAL DEFAULT 0");
  }

  // Ensure purchases table has updated_at column for tracking edits separately from original bill date
  const purchaseCols = query("PRAGMA table_info(purchases)").map(c => c.name);
  if (!purchaseCols.includes('updated_at')) {
    dbInstance.run("ALTER TABLE purchases ADD COLUMN updated_at DATETIME");
  }

  // Default store settings
  const checkSetting = queryOne("SELECT value FROM settings WHERE key = 'store_name'");
  if (!checkSetting) {
    dbInstance.run(`
      INSERT INTO settings (key, value) VALUES 
      ('store_name', 'Ibrahim Surgical Store'),
      ('tagline', 'Specialized Surgical & Patient Operation Theater Supplies'),
      ('phone', '0300-1234567'),
      ('address', 'Surgical Market, Hospital Road'),
      ('currency', 'PKR'),
      ('data_dir', ?),
      ('backup_interval', 'Daily on Startup')
    `, [DATA_DIR]);
  }

  saveDb();
  console.log(`Database ready. Stored at: ${DB_FILE}`);
  return dbInstance;
}

module.exports = {
  initDb,
  query,
  queryOne,
  run,
  saveDb,
  createBackup,
  DATA_DIR,
  DB_FILE,
  BACKUP_DIR
};
