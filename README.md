# NARASI 2026 — Situs & Bilik Suara

Situs statis (tanpa build) + Supabase sebagai backend. Semua logika voting ada di fungsi SQL (`supabase/schema.sql`).

Jadwal: voting buka **Senin 26 Okt 2026 00:00 WIB**, tutup **Jumat 30 Okt 23:59:59 WIB**, hasil terbuka otomatis di situs **13 Nov 2026 16:00 WIB**, setelah pengumuman Ketua (15.30) dan sayembara (15.45) di panggung (semua bisa diubah di panel admin, tab Jadwal).

## Isi folder

```
index.html            Home: hero, tentang singkat, dokumentasi berjalan, ajakan voting
about.html            About: 3 kegiatan (tab), timeline, rundown hari-H, materi seminar
voting.html           Voting: galeri karya, pasangan calon, bilik suara, hasil
kontak.html           Kontak: narahubung (WhatsApp/telepon), Instagram, FAQ
admin.html            panel panitia
css/ js/ vendor/ img/ aset
css/pages.css         gaya komponen multi halaman (menu bawah ponsel, kartu, dll)
css/motion.css, js/motion.js, js/motion-pre.js   lapisan animasi (GSAP lokal di vendor/)
js/config.js          ISI DI SINI URL & anon key Supabase
supabase/schema.sql   seluruh database + penyimpanan foto (aman dijalankan ulang)
supabase/reset.sql    hapus data uji coba (suara, calon, karya, dokumentasi) lewat SQL Editor
```

Teks statis (rundown, narasumber, narahubung, FAQ) ada langsung di berkas HTML-nya. Timeline ada di `js/site.js` (blok CONTENT).

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
   **Dokumentasi** → pilih beberapa foto sekaligus; langsung tampil sebagai kartu berjalan di Home. Beri keterangan, atur urutan, sembunyikan, atau hapus per foto. Selama belum ada foto, Home memakai 4 foto bawaan di `img/`.
3. **Jadwal** → cek waktu dalam WIB.
4. Uji coba dengan NIM palsu sebelum 26 Okt, lalu hapus suara uji lewat SQL Editor bila ada.

## Memperbarui dari versi sebelumnya
Jalankan ulang seluruh `supabase/schema.sql` di SQL Editor (aman, tidak menghapus data, boleh saat voting berjalan). Versi multi halaman menambah tabel `dokumentasi` dan memindah jam hasil dari 13.15 ke 16.00 WIB **hanya bila** jamnya masih nilai bawaan lama. Lalu push file situs terbaru dan refresh keras. Tautan lama seperti `situs/#voting` otomatis dialihkan ke `voting.html`.

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

Diuji pada Postgres 18: 107 uji SQL (suara serentak, RLS, hasil tersembunyi, idempotensi, tabel dokumentasi, migrasi jam hasil), 175 uji browser end-to-end (voting, admin, auditor, fase, 4 halaman di ponsel 390px dan desktop, dokumentasi, tab, kartu narasumber, kontak, mode gelap), dijalankan dua kali: dengan animasi dan dengan *reduce motion*, plus 65 uji khusus animasi. **Catatan jujur:** uji berjalan terhadap Postgres asli dengan lapisan penerjemah pengganti PostgREST/GoTrue/Storage, bukan Supabase sungguhan. Lakukan gladi di Supabase Anda (login admin, unggah satu foto dokumentasi, satu suara uji, jeda).

## Animasi
Lapisan animasi (GSAP 3.15 + ScrollTrigger + SplitText, disimpan lokal di `vendor/`, lisensi di `vendor/GSAP-LICENSE.txt`) memberi: intro hero, bilah progres gulir, penanda navigasi, jendela retro yang terbuka saat digulir, garis timeline yang terisi, galeri/calon yang muncul bergantian, lightbox, dan batang hasil yang tumbuh. Bilik suara sengaja tenang. Otomatis mati bila perangkat memakai *reduce motion*. Kartu dokumentasi berjalan memakai animasi CSS (berhenti saat ditahan atau saat kursor di atasnya). Untuk mematikan animasi GSAP: hapus tag `motion-pre.js`, `motion.css`, dan skrip `vendor/gsap*`, `SplitText`, `ScrollTrigger`, `motion.js` dari keempat halaman.
