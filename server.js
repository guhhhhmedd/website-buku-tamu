require('dotenv').config();
const express    = require('express');
const mysql      = require('mysql2');
const session    = require('express-session');
const bcrypt     = require('bcryptjs');
const nodemailer = require('nodemailer');
const path       = require('path');

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
  if (err) console.error('❌ Gagal konek ke MySQL:', err.message);
  else { console.log('✅ MySQL terhubung ke db:', process.env.DB_NAME); conn.release(); }
});

// ─── Email Transporter ────────────────────────────────────
const mailer = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// Cek koneksi email saat start
mailer.verify((err) => {
  if (err) {
    console.error('   Email GAGAL:', err.message);
    console.error('   Pastikan EMAIL_USER & EMAIL_PASS di .env benar');
    console.error('   EMAIL_PASS = App Password Gmail (bukan password biasa)');
    console.error('   Buat di: myaccount.google.com → Security → App Passwords');
  } else {
    console.log(' Email siap:', process.env.EMAIL_USER);
  }
});

// ─── Middleware 
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(session({
  secret: process.env.SESSION_SECRET || 'rahasia123',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 4 }
}));

//  Auth Middleware 
function authAdmin(req, res, next) {
  if (req.session && req.session.adminId) return next();
  res.status(401).json({ error: 'Akses ditolak. Silakan login.' });
}

//  Helper kirim email 
async function kirimEmail(to, subject, html) {
  try {
    const info = await mailer.sendMail({
      from: process.env.EMAIL_FROM || `"Kominfo Stan" <${process.env.EMAIL_USER}>`,
      to, subject, html,
    });
    console.log(' Email terkirim ke:', to, '| ID:', info.messageId);
    return true;
  } catch (e) {
    console.error(' Email gagal ke:', to, '|', e.message);
    return false;
  }
}


//  API TAMU

app.post('/api/kunjungan', (req, res) => {
  const { nama_tamu, email_tamu, no_hp, instansi, tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan } = req.body;

  if (!nama_tamu || !email_tamu || !no_hp || !tujuan_temu || !keperluan || !tgl_kunjungan || !jam_kunjungan)
    return res.status(400).json({ error: 'Semua kolom wajib diisi.' });

  const emailRgx = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRgx.test(email_tamu)) return res.status(400).json({ error: 'Format email tidak valid.' });

  const sql = `INSERT INTO kunjungan (nama_tamu, email_tamu, no_hp, instansi, tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;

  db.query(sql, [nama_tamu, email_tamu, no_hp, instansi || '-', tujuan_temu, keperluan, tgl_kunjungan, jam_kunjungan], async (err, result) => {
    if (err) { console.error(err); return res.status(500).json({ error: 'Gagal menyimpan data.' }); }

    // Balas ke client dulu, email di background
    res.status(201).json({ success: true, message: 'Permohonan berhasil dikirim!', id: result.insertId });

    const html = `
      <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
        <div style="background:linear-gradient(135deg,#1a1410,#2a1e14);padding:28px 32px">
          <h2 style="color:#b8860b;margin:0;font-size:20px"> Kominfo Stan</h2>
          <p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:11px;letter-spacing:3px;text-transform:uppercase">Sistem Manajemen Kunjungan</p>
        </div>
        <div style="padding:32px">
          <div style="background:#fef9ec;border:1px solid #f0d070;border-radius:8px;padding:12px 16px;margin-bottom:24px">
            <p style="margin:0;color:#78530a;font-size:14px;font-weight:600"> Permohonan Sedang Diproses</p>
          </div>
          <p style="color:#374151">Halo <strong>${nama_tamu}</strong>,</p>
          <p style="color:#6b7280;font-size:14px;line-height:1.7">Permohonan kunjungan Anda telah kami terima dan sedang menunggu konfirmasi admin Kominfo Stan. Anda akan mendapat email kembali setelah diproses.</p>
          <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:24px 0">
            <table style="width:100%;font-size:14px;border-collapse:collapse">
              <tr><td style="padding:8px 0;color:#9ca3af;width:45%">Ingin Bertemu</td><td style="padding:8px 0;color:#111827;font-weight:600">${tujuan_temu}</td></tr>
              <tr><td style="padding:8px 0;color:#9ca3af">Tanggal</td><td style="padding:8px 0;color:#111827;font-weight:600">${tgl_kunjungan}</td></tr>
              <tr><td style="padding:8px 0;color:#9ca3af">Jam</td><td style="padding:8px 0;color:#111827;font-weight:600">${jam_kunjungan}</td></tr>
              <tr><td style="padding:8px 0;color:#9ca3af">No. Referensi</td><td style="padding:8px 0;color:#8b3a2a;font-weight:700;font-size:16px">#${result.insertId}</td></tr>
            </table>
          </div>
        </div>
        <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center">
          <p style="color:#9ca3af;font-size:11px;margin:0">© Kominfo Stan — Sistem Manajemen Kunjungan Tamu</p>
        </div>
      </div>`;

    await kirimEmail(email_tamu, `Permohonan Kunjungan Diterima — Kominfo Stan (#${result.insertId})`, html);
  });
});


//  API ADMIN

app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username dan password wajib diisi.' });

  db.query('SELECT * FROM admins WHERE username = ?', [username], async (err, rows) => {
    if (err || rows.length === 0) return res.status(401).json({ error: 'Username atau password salah.' });
    const admin = rows[0];
    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ error: 'Username atau password salah.' });
    req.session.adminId   = admin.id;
    req.session.adminNama = admin.nama;
    res.json({ success: true, nama: admin.nama });
  });
});

app.post('/api/admin/logout', (req, res) => { req.session.destroy(); res.json({ success: true }); });

app.get('/api/admin/me', authAdmin, (req, res) => {
  res.json({ id: req.session.adminId, nama: req.session.adminNama });
});

app.get('/api/admin/kunjungan', authAdmin, (req, res) => {
  const { status } = req.query;
  let sql = `SELECT *, DATE_FORMAT(tgl_kunjungan,'%d %M %Y') AS tgl_fmt,
             DATE_FORMAT(created_at,'%d %b %Y %H:%i') AS dibuat FROM kunjungan`;
  const params = [];
  if (status && status !== 'semua') { sql += ' WHERE status = ?'; params.push(status); }
  sql += ' ORDER BY created_at DESC';
  db.query(sql, params, (err, rows) => {
    if (err) return res.status(500).json({ error: 'Gagal mengambil data.' });
    res.json({ success: true, data: rows });
  });
});

app.get('/api/admin/stats', authAdmin, (req, res) => {
  db.query(`SELECT COUNT(*) AS total, SUM(status='menunggu') AS menunggu,
            SUM(status='disetujui') AS disetujui, SUM(status='ditolak') AS ditolak FROM kunjungan`,
    (err, rows) => {
      if (err) return res.status(500).json({ error: 'Gagal.' });
      res.json({ success: true, data: rows[0] });
    });
});

app.patch('/api/admin/kunjungan/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  const { status, catatan_admin } = req.body;
  if (!['disetujui', 'ditolak'].includes(status)) return res.status(400).json({ error: 'Status tidak valid.' });

  db.query('SELECT * FROM kunjungan WHERE id = ?', [id], (err, rows) => {
    if (err || rows.length === 0) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    const k = rows[0];
    if (k.status !== 'menunggu') return res.status(400).json({ error: 'Permohonan ini sudah diproses.' });

    db.query('UPDATE kunjungan SET status=?, catatan_admin=? WHERE id=?', [status, catatan_admin || '', id], async (err2) => {
      if (err2) return res.status(500).json({ error: 'Gagal update.' });

      res.json({ success: true, message: `Permohonan berhasil ${status}.` });

      const isAcc = status === 'disetujui';
      const judul = isAcc ? 'Kunjungan Anda Disetujui!' : 'Kunjungan Anda Tidak Dapat Diproses';
      const html = `
        <div style="font-family:'Segoe UI',sans-serif;max-width:580px;margin:auto;background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">
          <div style="background:linear-gradient(135deg,#1a1410,#2a1e14);padding:28px 32px">
            <h2 style="color:#b8860b;margin:0;font-size:20px">🏛️ Kominfo Stan</h2>
            <p style="color:rgba(255,255,255,0.45);margin:4px 0 0;font-size:11px;letter-spacing:3px;text-transform:uppercase">Sistem Manajemen Kunjungan</p>
          </div>
          <div style="padding:32px">
            <div style="background:${isAcc?'#f0fdf4':'#fff1f2'};border:1px solid ${isAcc?'#86efac':'#fca5a5'};border-radius:8px;padding:12px 16px;margin-bottom:24px">
              <p style="margin:0;color:${isAcc?'#15803d':'#b91c1c'};font-size:15px;font-weight:700">${isAcc?'✅':'❌'} ${judul}</p>
            </div>
            <p style="color:#374151">Halo <strong>${k.nama_tamu}</strong>,</p>
            <p style="color:#6b7280;font-size:14px;line-height:1.7">${isAcc
              ? 'Selamat! Permohonan kunjungan Anda telah <strong>disetujui</strong>. Silakan datang sesuai jadwal dan membawa identitas diri.'
              : 'Mohon maaf, permohonan kunjungan Anda <strong>tidak dapat kami proses</strong> saat ini.'
            }</p>
            <div style="background:#f9fafb;border-radius:10px;padding:20px;margin:24px 0">
              <table style="width:100%;font-size:14px;border-collapse:collapse">
                <tr><td style="padding:8px 0;color:#9ca3af;width:45%">Ingin Bertemu</td><td style="padding:8px 0;color:#111827;font-weight:600">${k.tujuan_temu}</td></tr>
                <tr><td style="padding:8px 0;color:#9ca3af">Tanggal</td><td style="padding:8px 0;color:#111827;font-weight:600">${k.tgl_kunjungan}</td></tr>
                <tr><td style="padding:8px 0;color:#9ca3af">Jam</td><td style="padding:8px 0;color:#111827;font-weight:600">${k.jam_kunjungan}</td></tr>
                ${catatan_admin ? `<tr><td style="padding:8px 0;color:#9ca3af">Catatan Admin</td><td style="padding:8px 0;color:#374151">${catatan_admin}</td></tr>` : ''}
              </table>
            </div>
            ${isAcc ? '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:8px;padding:12px 16px"><p style="margin:0;color:#1d4ed8;font-size:13px">📍 Harap membawa <strong>KTP atau identitas diri</strong> saat tiba di kantor.</p></div>' : ''}
          </div>
          <div style="background:#f9fafb;padding:14px 32px;border-top:1px solid #e5e7eb;text-align:center">
            <p style="color:#9ca3af;font-size:11px;margin:0">© Kominfo Stan — Sistem Manajemen Kunjungan Tamu</p>
          </div>
        </div>`;

      await kirimEmail(k.email_tamu, `${judul} — Kominfo Stan`, html);
    });
  });
});

// DELETE /api/admin/kunjungan/:id — Hapus data
app.delete('/api/admin/kunjungan/:id', authAdmin, (req, res) => {
  const { id } = req.params;
  db.query('DELETE FROM kunjungan WHERE id = ?', [id], (err, result) => {
    if (err) return res.status(500).json({ error: 'Gagal menghapus data.' });
    if (result.affectedRows === 0) return res.status(404).json({ error: 'Data tidak ditemukan.' });
    res.json({ success: true, message: 'Data berhasil dihapus.' });
  });
});

//  Pages 
app.get('/admin', (req, res) => res.sendFile(path.join(__dirname, 'public/pages/admin.html')));
app.get('*',     (req, res) => res.sendFile(path.join(__dirname, 'public/index.html')));

app.listen(PORT, () => {
  console.log(`\n  Kominfo Stan  → http://localhost:${PORT}`);
  console.log(`   Admin Panel   → http://localhost:${PORT}/admin\n`);
});
