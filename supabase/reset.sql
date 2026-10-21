-- =====================================================================
-- RESET DATA UJI COBA  (jalankan di Supabase > SQL Editor)
-- Tidak menghapus tabel, akun admin, atau jadwal. Pilih blok yang perlu,
-- blok A-C aman dijalankan bersamaan (satu transaksi).
-- PERINGATAN: penghapusan tidak bisa dibatalkan.
-- =====================================================================

-- ---------------------------------------------------------------------
-- LIHAT DULU apa yang ada (aman, hanya membaca). Jalankan sendiri dulu;
-- SQL Editor hanya menampilkan hasil pernyataan terakhir bila dijalankan bersama.
-- ---------------------------------------------------------------------
select
  (select count(*) from suara_karya) as suara_sayembara,
  (select count(*) from suara_calon) as suara_ketua,
  (select count(*) from karya)       as karya,
  (select count(*) from calon)       as calon,
  (select count(*) from pemilih)     as pemilih,
  (select count(*) from percobaan)   as percobaan_tercatat,
  (select count(*) from log_audit)   as baris_log;

-- ---------------------------------------------------------------------
-- A. Hapus SEMUA suara (pemilih bisa memilih lagi) dan kunci percobaan
-- ---------------------------------------------------------------------
begin;
  delete from suara_karya;
  delete from suara_calon;
  delete from percobaan;
commit;

-- ---------------------------------------------------------------------
-- B. Hapus SEMUA calon ketua/wakil  (suara ketua harus sudah kosong: jalankan A dulu)
-- ---------------------------------------------------------------------
begin;
  delete from suara_calon;
  delete from calon;
commit;

-- ---------------------------------------------------------------------
-- C. Hapus SEMUA karya sayembara  (suara sayembara ikut dihapus)
-- ---------------------------------------------------------------------
begin;
  delete from suara_karya;
  delete from karya;
commit;

-- ---------------------------------------------------------------------
-- D. (Pilihan) Kosongkan daftar pemilih, lalu impor ulang lewat panel admin
--    Suara harus kosong lebih dulu (jalankan A).
-- ---------------------------------------------------------------------
-- begin; delete from suara_karya; delete from suara_calon; delete from pemilih; commit;

-- ---------------------------------------------------------------------
-- E. (Pilihan) Kosongkan log audit. Sebaiknya JANGAN dilakukan setelah voting
--    resmi dimulai, karena log adalah bukti. Aman untuk membersihkan uji coba.
-- ---------------------------------------------------------------------
-- delete from log_audit;

-- ---------------------------------------------------------------------
-- Hapus SATU pemilih saja dari suara (mis. NIM tertentu memilih lagi)
-- ---------------------------------------------------------------------
-- delete from suara_karya where nim = '2026001';
-- delete from suara_calon where nim = '2026001';

-- Catatan: berkas foto di Storage tidak ikut terhapus. Bersihkan lewat
-- Supabase > Storage > bucket "narasi" (SQL tidak diizinkan menghapus berkas).
