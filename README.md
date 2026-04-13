# 🏛️ Buku Tamu Digital — Kominfo Stan

Sistem manajemen kunjungan tamu untuk kantor Kominfo Stan.

## Alur Sistem

```
Tamu → Isi Form → Kirim Permohonan
                      ↓
              [Email konfirmasi ke tamu]
                      ↓
              Admin login → Lihat daftar
                      ↓
           [Setujui / Tolak + catatan]
                      ↓
         [Email notifikasi status ke tamu]
```

## Struktur Proyek

```
bukutamu/
├── public/
│   ├── index.html          ← Halaman tamu (form permohonan)
│   └── pages/
│       └── admin.html      ← Dashboard admin
├── server.js               ← Backend Express + semua API
├── database.sql            ← Script setup MySQL
├── .env                    ← Konfigurasi
├── package.json
└── README.md
```

## Instalasi

### 1. Setup Database

```bash
mysql -u root -p < database.sql
```

### 2. Konfigurasi `.env`

```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=password_kamu
DB_NAME=db_bukutamu

PORT=3000
SESSION_SECRET=ganti_dengan_string_acak_panjang

# Gmail untuk kirim email notifikasi
EMAIL_USER=email@gmail.com
EMAIL_PASS=xxxx xxxx xxxx xxxx   ← App Password Gmail (bukan password biasa)
EMAIL_FROM=Kominfo Stan <email@gmail.com>
```

> **Cara buat App Password Gmail:**
> Gmail → Manage Account → Security → 2-Step Verification → App Passwords → buat baru

### 3. Install & Jalankan

```bash
npm install
node server.js
```

### 4. Akses

| URL | Keterangan |
|-----|------------|
| `http://localhost:3000` | Halaman tamu (publik) |
| `http://localhost:3000/admin` | Dashboard admin |

---

## Login Admin Default

| Username | Password |
|----------|----------|
| `admin`  | `admin123` |

> ⚠️ **Segera ganti password setelah deploy!**
> Gunakan bcrypt untuk hash password baru.

## API Endpoints

| Method | Endpoint | Auth | Keterangan |
|--------|----------|------|------------|
| POST | `/api/kunjungan` | ✗ | Tamu ajukan permohonan |
| POST | `/api/admin/login` | ✗ | Login admin |
| POST | `/api/admin/logout` | ✓ | Logout |
| GET  | `/api/admin/me` | ✓ | Info admin aktif |
| GET  | `/api/admin/kunjungan` | ✓ | Daftar permohonan |
| GET  | `/api/admin/stats` | ✓ | Statistik |
| PATCH | `/api/admin/kunjungan/:id` | ✓ | Setujui / Tolak |

## Ganti Password Admin

```sql
USE db_bukutamu;
-- Generate hash dulu di Node.js: require('bcryptjs').hashSync('password_baru', 10)
UPDATE admins SET password='HASH_BARU' WHERE username='admin';
```
