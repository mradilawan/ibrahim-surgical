const http = require('http');

function request(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: 3721,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' }
    };
    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(data) }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function testCustomRates() {
  console.log('Testing Dealer-Specific Custom Rates...');

  // 1. Add dealer
  const addCust = await request('POST', '/api/customers', { name: 'Al-Shifa Hospital', mobile: '03001234567' });
  const custId = addCust.body.data.id;
  console.log('Created test dealer ID:', custId);

  // 2. Set custom price for product 1 to 48
  await request('POST', `/api/customers/${custId}/rates`, { product_id: 1, custom_price: 48 });
  console.log('Set custom price for product 1 = Rs. 48');

  // 3. Verify
  const rates = await request('GET', `/api/customers/${custId}/rates`);
  if (rates.body.data.map['1'] !== 48) {
    throw new Error('Custom rate verification failed');
  }
  console.log('Verified: Al-Shifa Hospital gets Guaze Pad at Rs. 48!');

  // 4. Clean up test customer
  await request('DELETE', `/api/customers/${custId}`);
  console.log('Cleaned up test customer. Verification PASSED!');
}

testCustomRates().then(() => process.exit(0)).catch(err => {
  console.error(err);
  process.exit(1);
});
