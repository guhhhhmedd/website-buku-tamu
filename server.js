require('dotenv').config();
const express  = require('express');
const mysql    = require('mysql2');
const session  = require('express-session');
const bcrypt   = require('bcryptjs');
const nodemailer = require('nodemailer');
const path     = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

// ─── Database ──────────────────────────────────────────────
const db = mysql.createPool({
  host:     process.env.DB_HOST || 'localhost',
  user:     process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'db_bukutamu',
  waitForConnections: true,
  connectionLimit: 10,
});

db.getConnection((err, conn) => {
  if (err) console.error('❌ DB Error:', err.message);
  else { console.log('✅ MySQL terhubung'); conn.release(); }
});

// ─── Email Transporter ────────────────────────────────────
const mailer = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// ─── Middleware ───────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 } // 4 jam
}));

// ─── Auth Middleware ──────────────────────────────────────
function authAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: 'Akses ditolak. Silakan login.' });
}

// ─── Helper: kirim email notifikasi ──────────────────────
async function kirimEmail(to, subject, html) {
  try {
    await mailer.sendMail({
      from: process.env.EMAIL_FROM,
      to, subject, html
    });
    console.log('📧 Email terkirim ke:', to);
  } catch (e) {
    console.warn('⚠️  Email gagal terkirim:', e.message);
    // Non-fatal — app tetap jalan
  }
}

// ═══════════════════════════════════════════════════════════
//  API — TAMU
// ═══════════════════════════════════════════════════════════

// POST /api/kunjungan — Tamu ajukan permohonan
app.post('/api/kunjungan', (req, res) => {
  const { nama_tamu, email_tamu, no_hp, instansi, tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan } = req.body;

  if (!nama_tamu || !email_tamu || !no_hp || !tujuan_temu || !keperluan || !tgl_kunjungan || !jam_kunjungan) {
    return res.status(400).json({ error: 'Semua kolom wajib wajib diisi.' });
  }

  const emailRgx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRgx.test(email_tamu)) return res.status(400).json({ error: 'Format email tidak valid.' });

  const sql = `INSERT INTO kunjungan (nama_tamu, email_tamu, no_hp, instansi, tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [nama_tamu, email_tamu, no_hp, instansi || '-', tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan], async (err, result) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Gagal menyimpan data.' }); }

    // Email konfirmasi ke tamu
    const html = `
      <div style="font-family:sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
        <div style="background:#1a3a5c;padding:24px 30px">
          <h2 style="color:white;margin:0">Kominfo Stan</h2>
          <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">Sistem Manajemen Kunjungan</p>
        </div>
        <div style="padding:30px">
          <h3 style="color:#1a3a5c">Permohonan Kunjungan Diterima ✅</h3>
          <p>Halo <strong>${nama_tamu}</strong>,</p>
          <p>Permohonan kunjungan Anda telah kami terima dan sedang menunggu konfirmasi dari admin.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
            <tr><td style="padding:8px;color:#666;width:40%">Tujuan bertemu</td><td style="padding:8px"><strong>${tujuan_temu}</strong></td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Tanggal</td><td style="padding:8px"><strong>${tgl_kunjungan}</strong></td></tr>
            <tr><td style="padding:8px;color:#666">Jam</td><td style="padding:8px"><strong>${jam_kunjungan}</strong></td></tr>
            <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">No. Referensi</td><td style="padding:8px"><strong>#${result.insertId}</strong></td></tr>
          </table>
          <p style="font-size:13px;color:#888">Anda akan mendapatkan email konfirmasi setelah admin memproses permohonan ini.</p>
        </div>
      </div>`;

    await kirimEmail(email_tamu, 'Permohonan Kunjungan Diterima — Kominfo Stan', html);

    res.status(201).json({ success: true, message: 'Permohonan berhasil dikirim! Cek email Anda untuk konfirmasi.', id: result.insertId });
  });
});

// ═══════════════════════════════════════════════════════════
//  API — ADMIN
// ═══════════════════════════════════════════════════════════

// POST /api/admin/login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });

  db.query('SELECT * FROM admins WHERE username = ?', [username], async (err, rows) => {
    if (err || rows.length === 0) return res.status(401).json({ error: 'Username atau password salah.' });

    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: 'Username atau password salah.' });

    req.session.adminId = admin.id;
    req.session.adminNama = admin.nama;
    res.json({ success: true, nama: admin.nama });
  });
});

// POST /api/admin/logout
app.post('/api/admin/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// GET /api/admin/me
app.get('/api/admin/me', authAdmin, (req, res) => {
  res.json({ id: req.session.adminId, nama: req.session.adminNama });
});

// GET /api/admin/kunjungan — Daftar semua kunjungan
app.get('/api/admin/kunjungan', authAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT *, DATE_FORMAT(tgl_kunjungan,'%d %M %Y') AS tgl_fmt,
             DATE_FORMAT(created_at,'%d %b %Y %H:%i') AS dibuat
             FROM kunjungan`;
  const params = [];
  if (status && status !== 'semua') { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';

  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Gagal mengambil data.' });
    res.json({ success: true, data: rows });
  });
});

// GET /api/admin/stats
app.get('/api/admin/stats', authAdmin, (req, res) => {
  const sql = `SELECT
    COUNT(*) AS total,
    SUM(status='menunggu') AS menunggu,
    SUM(status='disetujui') AS disetujui,
    SUM(status='ditolak') AS ditolak
    FROM kunjungan`;
  db.query(sql, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Gagal.' });
    res.json({ success: true, data: rows[0] });
  });
});

// PATCH /api/admin/kunjungan/:id — Acc atau tolak
app.patch('/api/admin/kunjungan/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const { status, catatan_admin } = req.body;

  if (!['disetujui', 'ditolak'].includes(status)) {
    return res.status(400).json({ error: 'Status tidak valid.' });
  }

  db.query('SELECT * FROM kunjungan WHERE id = ?', [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Data tidak ditemukan.' });

    const kunjungan = rows[0];
    if (kunjungan.status !== 'menunggu') {
      return res.status(400).json({ error: 'Permohonan ini sudah diproses.' });
    }

    db.query('UPDATE kunjungan SET status=?, catatan_admin=? WHERE id=?', [status, catatan_admin || '', id], async (err2) => {
      if (err2) return res.status(500).json({ error: 'Gagal update.' });

      // Kirim email ke tamu
      const isAcc  = status === 'disetujui';
      const warna  = isAcc ? '#16a34a' : '#dc2626';
      const ikon   = isAcc ? '✅' : '❌';
      const judul  = isAcc ? 'Kunjungan Anda Disetujui!' : 'Kunjungan Anda Ditolak';
      const pesan  = isAcc
        ? `Selamat! Permohonan kunjungan Anda telah <strong>disetujui</strong>. Silakan datang sesuai jadwal yang telah ditentukan.`
        : `Mohon maaf, permohonan kunjungan Anda <strong>tidak dapat disetujui</strong> saat ini.`;

      const html = `
        <div style="font-family:sans-serif;max-width:560px;margin:auto;border:1px solid #e0e0e0;border-radius:8px;overflow:hidden">
          <div style="background:#1a3a5c;padding:24px 30px">
            <h2 style="color:white;margin:0">Kominfo Stan</h2>
            <p style="color:#a8c4e0;margin:4px 0 0;font-size:13px">Sistem Manajemen Kunjungan</p>
          </div>
          <div style="padding:30px">
            <h3 style="color:${warna}">${ikon} ${judul}</h3>
            <p>Halo <strong>${kunjungan.nama_tamu}</strong>,</p>
            <p>${pesan}</p>
            <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:14px">
              <tr><td style="padding:8px;color:#666;width:40%">Tujuan bertemu</td><td style="padding:8px"><strong>${kunjungan.tujuan_temu}</strong></td></tr>
              <tr style="background:#f5f5f5"><td style="padding:8px;color:#666">Tanggal</td><td style="padding:8px"><strong>${kunjungan.tgl_kunjungan}</strong></td></tr>
              <tr><td style="padding:8px;color:#666">Jam</td><td style="padding:8px"><strong>${kunjungan.jam_kunjungan}</strong></td></tr>
              ${catatan_admin ? `<tr style="background:#fff3cd"><td style="padding:8px;color:#666">Catatan Admin</td><td style="padding:8px">${catatan_admin}</td></tr>` : ''}
            </table>
            ${isAcc ? '<p style="background:#dcfce7;padding:14px;border-radius:6px;font-size:13px">📍 Harap membawa identitas diri saat berkunjung ke kantor Kominfo Stan.</p>' : ''}
          </div>
        </div>`;

      await kirimEmail(kunjungan.email_tamu, `${judul} — Kominfo Stan`, html);

      res.json({ success: true, message: `Permohonan berhasil ${status}.` });
    });
  });
});

// ─── HTML Pages ────────────────────────────────────────────
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/admin.html')));
app.get('*',     (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

// ─── Start ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏛️  Buku Tamu Kominfo Stan → http://localhost:${PORT}`);
  console.log(`   Dashboard Admin         → http://localhost:${PORT}/admin\n`);
});
