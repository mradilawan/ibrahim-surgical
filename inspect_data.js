const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, 'imported_data');

function readJsonClean(filename) {
  let content = fs.readFileSync(path.join(dataDir, filename), 'utf8');
  content = content.replace(/^\uFEFF/, '').trim();
  return JSON.parse(content);
}

const products = readJsonClean('products.json');
const customers = readJsonClean('customers.json');
const suppliers = readJsonClean('suppliers.json');

console.log('Products Count:', products.length);
console.log('Sample Products:');
products.slice(0, 6).forEach(p => {
  console.log(`- ID: ${p.id} | SKU: ${p.sku} | Name: ${p.product} | Unit: ${p.unit} | Cost: ${p.min_purchase_price} | Sell: ${p.min_price} | Stock: ${p.current_stock} | Alert: ${p.alert_quantity}`);
});

console.log('\nCustomers Count:', customers.length);
console.log('Sample Customers:');
customers.slice(0, 5).forEach(c => {
  console.log(`- ID: ${c.id} | Name: ${c.name} | Business: ${c.supplier_business_name || 'N/A'} | Mobile: ${c.mobile || 'N/A'}`);
});

console.log('\nSuppliers Count:', suppliers.length);
suppliers.forEach(s => {
  console.log(`- ID: ${s.id} | Name: ${s.name} | Business: ${s.supplier_business_name || 'N/A'} | Mobile: ${s.mobile || 'N/A'}`);
});
