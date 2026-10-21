# NARASI 2026 — Situs & Bilik Suara

Situs statis (tanpa build) + Supabase sebagai backend. Semua logika voting ada di fungsi SQL (`supabase/schema.sql`).

Jadwal: voting buka **Senin 26 Okt 2026 00:00 WIB**, tutup **Jumat 30 Okt 23:59:59 WIB**, hasil terbuka otomatis **13 Nov 2026 13:15 WIB** (semua bisa diubah di panel admin, tab Jadwal).

## Isi folder

```
index.html            situs publik + bilik suara + hasil
admin.html            panel panitia
css/ js/ vendor/ img/ aset
js/config.js          ISI DI SINI URL & anon key Supabase
supabase/schema.sql   seluruh database + penyimpanan foto (aman dijalankan ulang)
supabase/reset.sql    hapus data uji coba (suara, calon, karya) lewat SQL Editor
```

## Pemasangan (±20 menit)

### 1. Supabase
1. Buat project di supabase.com. Pilih region terdekat (Singapore). Data NIM/nama adalah data pribadi mahasiswa; simpan seperlunya dan hapus setelah acara (UU PDP).
2. **SQL Editor** → tempel seluruh isi `supabase/schema.sql` → Run.
3. **Authentication → Users → Add user**: buat akun untuk 2–3 panitia inti (email + sandi kuat, centang auto-confirm). Matikan pendaftaran publik: Authentication → Sign In / Providers → matikan *Allow new users to sign up*.
4. Jadikan mereka admin (ganti email/nama; `true` = juga auditor):
   ```sql
   insert into admin(user_id, email, nama, auditor)
   select id, email, 'Nama Panitia', false from auth.users where email = 'email@panitia.id';
   ```
   Hanya **satu** orang yang sebaiknya `auditor = true`.
5. **Project Settings → API**: salin *Project URL* dan *anon public key*.

### 2. Isi `js/config.js`
```js
window.NARASI_CONFIG = { SUPABASE_URL: "https://xxxx.supabase.co", SUPABASE_ANON_KEY: "eyJ..." };
```
Hanya anon key. **Jangan pernah** menaruh `service_role` di sini.

### 3. Deploy
Unggah folder ini ke GitHub lalu hubungkan ke Cloudflare Pages / Netlify / Vercel (build command kosong, output directory `/`). Jika memakai domain kustom untuk Supabase, tambahkan domain itu ke `connect-src` pada tag CSP di `index.html` dan `admin.html`.

### 4. Isi data (panel `/admin.html`)
1. **Pemilih** → pilih kelas → tempel daftar (satu baris: `NIM` atau `NIM, Nama`) → Impor.
2. **Karya** → isi nama, unggah foto (boleh banyak; otomatis diperkecil), tempel tautan **YouTube** untuk video (diputar langsung di situs; unggah videonya ke YouTube dulu, mode *Unlisted* cukup). **Calon** → unggah foto Ketua dan Wakil; otomatis dipotong ke rasio 4:5 dari tengah gambar. Centang *Tayang* agar tampil dan bisa dipilih.
3. **Jadwal** → cek waktu dalam WIB.
4. Uji coba dengan NIM palsu sebelum 26 Okt, lalu hapus suara uji lewat SQL Editor bila ada.

## Memperbarui dari versi sebelumnya
Jalankan ulang seluruh `supabase/schema.sql` di SQL Editor (aman, tidak menghapus data). Ini menambah kolom foto dan bucket penyimpanan `narasi` (publik untuk dilihat; hanya admin yang boleh mengunggah). Lalu push file situs terbaru dan refresh keras.

## Menghapus data uji coba
Buka `supabase/reset.sql`, jalankan blok yang dibutuhkan (A: semua suara, B: calon, C: karya). Admin, jadwal, dan daftar pemilih tidak ikut terhapus. Berkas foto bekas uji bersihkan lewat Supabase > Storage > `narasi`. Sebelum membuka voting resmi, jalankan blok A untuk memastikan suara kosong.

## Cara kerja & batasan (baca ini)

- Pemilih memasukkan **NIM + kelas**; harus ada di daftar pemilih. NIM bisa ditebak teman, jadi ada pembatasan percobaan (gagal berulang per IP, per NIM, dan global mengunci 15 menit; panitia membuka kunci di tab Pemilih) dan semua tercatat. Ini pencegah, bukan jaminan mutlak. Jika perlu lebih ketat, tambahkan kode unik per pemilih.
- Satu NIM = satu suara per surat (sayembara, ketua). Suara final. Boleh memilih satu surat saja.
- Suara disimpan **beserta NIM**. Hanya akun auditor yang bisa melihatnya, dan setiap akses tercatat di Log dengan nama akun. Auditor dapat melihat suara sebelum hasil dibuka; beri tahu peserta.
- Hasil publik tidak pernah terbuka sebelum voting ditutup, berapa pun nilai waktu hasil. Seri ditandai.
- Deteksi IP bergantung header `cf-connecting-ip` / `x-forwarded-for`; di balik proxy lain perilakunya bisa berbeda.
- Tombol **jeda** di tab Jadwal menutup bilik seketika (darurat).

## Pengujian

Telah diuji pada Postgres 18 dengan 95 uji SQL (termasuk suara serentak, RLS, hasil tersembunyi, idempotensi) dan 82 uji browser end-to-end (voting, admin, auditor, fase, ponsel 390px, mode gelap). **Catatan jujur:** uji berjalan terhadap Postgres asli dengan lapisan penerjemah pengganti PostgREST/GoTrue, bukan Supabase sungguhan. Lakukan gladi di Supabase Anda sebelum 26 Okt (login admin, impor, satu suara uji, jeda, buka kunci).
