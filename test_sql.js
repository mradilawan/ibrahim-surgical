const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

async function testSqlJs() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  
  db.run(`CREATE TABLE test (id INTEGER PRIMARY KEY, name TEXT);`);
  db.run(`INSERT INTO test (name) VALUES ('Ibrahim Surgical');`);
  
  const res = db.exec("SELECT * FROM test");
  console.log('Query result:', res);
  
  // Test writing to E: drive
  const targetDir = 'E:\\Ibrahim_Surgical_Data';
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
  
  const data = db.export();
  const buffer = Buffer.from(data);
  const testFile = path.join(targetDir, 'test.sqlite');
  fs.writeFileSync(testFile, buffer);
  
  console.log('Successfully wrote test.sqlite to', testFile, 'File size:', fs.statSync(testFile).size, 'bytes');
  
  // Clean up test file
  fs.unlinkSync(testFile);
  console.log('Cleaned up test file. Test PASSED!');
}

testSqlJs().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
