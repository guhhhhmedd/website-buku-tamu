// koneksi/db.js
const mysql = require('mysql2');
require('dotenv').config();

const db = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_bukutamu',
  waitForConnections: true,
  connectionLimit: 10,
});


db.getConnection((err, conn) => {
  if (err) console.error('Gagal konek ', err.message);
  else { console.log(' terhubung'); conn.release(); }
});

module.exports = db; // WAJIB ADA ini