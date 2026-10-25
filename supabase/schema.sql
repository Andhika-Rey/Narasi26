-- =====================================================================
-- NARASI 2026 · Skema database voting (Supabase / Postgres)
-- Jalankan SELURUH berkas ini sekali di Supabase > SQL Editor > New query.
-- Aman dijalankan ulang (idempoten): data tidak dihapus.
--
-- Prinsip:
--  * Publik (anon) TIDAK punya akses tabel sama sekali. Semua lewat fungsi.
--  * Aturan voting ditegakkan di server, bukan di halaman web.
--  * Satu NIM = satu suara per surat suara (sayembara, ketua), final.
--  * Suara tersimpan bersama NIM. Hanya akun auditor yang bisa membacanya
--    dan setiap pembacaan tercatat di log_audit.
--  * Hasil terbuka otomatis pada pengaturan.hasil_at (dan tidak sebelum
--    voting ditutup).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. TABEL
-- ---------------------------------------------------------------------
create table if not exists kelas (
  kode  text primary key,
  label text not null,
  urut  int  not null default 0
);

insert into kelas (kode, label, urut) values
  ('A', 'Reguler A', 1),
  ('B', 'Reguler B', 2),
  ('C', 'Reguler C', 3),
  ('D', 'Reguler D', 4)
on conflict (kode) do nothing;

create table if not exists pemilih (
  nim     text primary key check (nim ~ '^[A-Z0-9._-]{4,24}$'),
  kelas   text not null references kelas (kode),
  nama    text,
  dibuat  timestamptz not null default now()
);

create table if not exists karya (
  id             uuid primary key default gen_random_uuid(),
  kelompok       text not null,
  nama_angkatan  text not null,
  slogan         text,
  filosofi       text,
  tautan_video   text check (tautan_video is null or tautan_video ~* '^https?://'),
  tautan_paket   text check (tautan_paket is null or tautan_paket ~* '^https?://'),
  urut           int  not null default 0,
  tayang         boolean not null default false,
  dibuat         timestamptz not null default now()
);

create table if not exists calon (
  id               uuid primary key default gen_random_uuid(),
  ketua            text not null,
  wakil            text not null,
  visi             text,
  tautan_kampanye  text check (tautan_kampanye is null or tautan_kampanye ~* '^https?://'),
  urut             int  not null default 0,
  tayang           boolean not null default false,
  dibuat           timestamptz not null default now()
);

-- Kolom foto (v2). Yang disimpan hanya PATH berkas di bucket "narasi", bukan URL.
alter table karya add column if not exists foto        text[] not null default '{}';
alter table calon add column if not exists foto_ketua  text;
alter table calon add column if not exists foto_wakil  text;
alter table karya drop constraint if exists karya_foto_path;
alter table karya add  constraint karya_foto_path check (array_to_string(foto, ',') ~ '^([a-z0-9_-]+/[a-z0-9-]+\.(jpg|jpeg|png|webp)(,[a-z0-9_-]+/[a-z0-9-]+\.(jpg|jpeg|png|webp))*)?$');
alter table calon drop constraint if exists calon_foto_path;
alter table calon add  constraint calon_foto_path check (
  (foto_ketua is null or foto_ketua ~ '^[a-z0-9_-]+/[a-z0-9-]+\.(jpg|jpeg|png|webp)$') and (foto_wakil is null or foto_wakil ~ '^[a-z0-9_-]+/[a-z0-9-]+\.(jpg|jpeg|png|webp)$'));

create table if not exists pengaturan (
  id        int primary key default 1 check (id = 1),
  buka_at   timestamptz not null default '2026-10-26 00:00:00+07',
  tutup_at  timestamptz not null default '2026-10-30 23:59:59+07',
  hasil_at  timestamptz not null default '2026-11-13 16:00:00+07',
  dijeda    boolean not null default false,
  check (buka_at < tutup_at),
  check (hasil_at >= tutup_at)
);
insert into pengaturan (id) values (1) on conflict (id) do nothing;
-- Jam hasil mengikuti rundown siang (pengumuman 15.30–16.00). Hanya mengubah bila masih nilai lama.
update pengaturan set hasil_at = '2026-11-13 16:00:00+07' where id = 1 and hasil_at = '2026-11-13 13:15:00+07';
alter table pengaturan alter column hasil_at set default '2026-11-13 16:00:00+07';

-- Foto dokumentasi untuk halaman Home (kartu berjalan). Satu baris = satu foto.
create table if not exists dokumentasi (
  id          uuid primary key default gen_random_uuid(),
  foto        text not null check (foto ~ '^[a-z0-9_-]+/[a-z0-9-]+\.(jpg|jpeg|png|webp)$'),
  keterangan  text check (keterangan is null or char_length(keterangan) <= 120),
  urut        int  not null default 0,
  tayang      boolean not null default true,
  dibuat      timestamptz not null default now()
);

create table if not exists admin (
  user_id  uuid primary key references auth.users (id) on delete cascade,
  email    text not null,
  nama     text,
  auditor  boolean not null default false,
  dibuat   timestamptz not null default now()
);

-- Satu NIM satu suara per surat suara: dijamin oleh primary key.
create table if not exists suara_karya (
  nim       text primary key references pemilih (nim) on delete restrict,
  karya_id  uuid not null references karya (id) on delete restrict,
  waktu     timestamptz not null default now()
);

create table if not exists suara_calon (
  nim       text primary key references pemilih (nim) on delete restrict,
  calon_id  uuid not null references calon (id) on delete restrict,
  waktu     timestamptz not null default now()
);

create table if not exists log_audit (
  id      bigserial primary key,
  waktu   timestamptz not null default now(),
  aktor   text not null,
  aksi    text not null,
  detail  jsonb
);

create table if not exists percobaan (
  id     bigserial primary key,
  waktu  timestamptz not null default now(),
  ip     text not null,
  nim    text,
  kelas  text,
  ok     boolean not null default false
);
create index if not exists percobaan_waktu_idx on percobaan (waktu);
create index if not exists percobaan_ip_idx on percobaan (ip, waktu);
create index if not exists percobaan_nim_idx on percobaan (nim, waktu);

-- ---------------------------------------------------------------------
-- 2. FUNGSI BANTU (internal)
-- ---------------------------------------------------------------------
create or replace function is_admin() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admin where user_id = auth.uid());
$$;

create or replace function is_auditor() returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select exists (select 1 from admin where user_id = auth.uid() and auditor);
$$;

create or replace function aktor_saat_ini() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce((select email from admin where user_id = auth.uid()), 'sistem');
$$;

create or replace function ip_klien() returns text
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare h jsonb; v text;
begin
  begin
    h := nullif(current_setting('request.headers', true), '')::jsonb;
  exception when others then
    h := null;
  end;
  v := coalesce(h ->> 'cf-connecting-ip',
                btrim(split_part(coalesce(h ->> 'x-forwarded-for', ''), ',', 1)));
  return coalesce(nullif(v, ''), 'tak-dikenal');
end $$;

-- Fase voting menurut jam server: sebelum | buka | tutup | dijeda
create or replace function _fase() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when now() < buka_at  then 'sebelum'
    when now() > tutup_at then 'tutup'
    when dijeda           then 'dijeda'
    else 'buka'
  end
  from pengaturan where id = 1;
$$;

-- Verifikasi NIM + kelas terhadap daftar pemilih, dengan pembatasan
-- percobaan salah. Mengembalikan NIM ternormalisasi atau kode galat.
-- (Sengaja tidak memakai RAISE agar catatan percobaan gagal tetap tersimpan.)
create or replace function _verifikasi(p_nim text, p_kelas text)
returns table (v_nim text, v_err text)
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n text := upper(btrim(coalesce(p_nim, '')));
  k text := upper(btrim(coalesce(p_kelas, '')));
  alamat text := ip_klien();
  gagal_ip int; gagal_nim int; gagal_total int;
begin
  delete from percobaan where waktu < now() - interval '1 day';

  select count(*) into gagal_ip    from percobaan where ip = alamat and not ok and waktu > now() - interval '15 minutes';
  select count(*) into gagal_nim   from percobaan where nim = n and not ok and waktu > now() - interval '15 minutes';
  select count(*) into gagal_total from percobaan where not ok and waktu > now() - interval '5 minutes';

  if gagal_ip >= 30 or gagal_nim >= 6 or gagal_total >= 300 then
    return query select null::text, 'terlalu_banyak'::text;
    return;
  end if;

  if n = '' or k = '' or not exists (select 1 from pemilih where nim = n and kelas = k) then
    insert into percobaan (ip, nim, kelas, ok) values (alamat, left(n, 24), left(k, 8), false);
    return query select null::text, 'tidak_cocok'::text;
    return;
  end if;

  return query select n, null::text;
end $$;

-- ---------------------------------------------------------------------
-- 3. FUNGSI PUBLIK (anon boleh memanggil)
-- ---------------------------------------------------------------------
create or replace function status_publik() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'sekarang', now(),
    'fase', _fase(),
    'buka', p.buka_at,
    'tutup', p.tutup_at,
    'hasil_at', p.hasil_at,
    'hasil_terbuka', now() >= greatest(p.hasil_at, p.tutup_at),
    'kelas', coalesce((select jsonb_agg(jsonb_build_object('kode', kode, 'label', label) order by urut, kode) from kelas), '[]'::jsonb),
    'karya', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'kelompok', kelompok, 'nama', nama_angkatan, 'slogan', slogan,
        'filosofi', filosofi, 'tautan_video', tautan_video, 'tautan_paket', tautan_paket, 'foto', to_jsonb(foto))
        order by urut, dibuat)
      from karya where tayang), '[]'::jsonb),
    'calon', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', id, 'ketua', ketua, 'wakil', wakil, 'visi', visi, 'tautan_kampanye', tautan_kampanye,
        'foto_ketua', foto_ketua, 'foto_wakil', foto_wakil)
        order by urut, dibuat)
      from calon where tayang), '[]'::jsonb),
    'dokumentasi', coalesce((
      select jsonb_agg(jsonb_build_object('id', id, 'foto', foto, 'keterangan', keterangan) order by urut, dibuat)
      from dokumentasi where tayang), '[]'::jsonb)
  )
  from pengaturan p where p.id = 1;
$$;

create or replace function hasil_publik() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare p pengaturan%rowtype; hs jsonb; hc jsonb;
begin
  select * into p from pengaturan where id = 1;
  if now() < greatest(p.hasil_at, p.tutup_at) then
    return jsonb_build_object('terbuka', false, 'hasil_at', p.hasil_at);
  end if;

  with t as (
    select k.id, k.nama_angkatan as label, k.kelompok as sub, count(s.nim)::int as jumlah, k.urut, k.dibuat
    from karya k left join suara_karya s on s.karya_id = k.id
    where k.tayang group by k.id
  ), r as (
    select *, rank() over (order by jumlah desc)::int as peringkat from t
  ), s as (
    select *, (count(*) over (partition by peringkat)) > 1 as seri from r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'sub', sub, 'jumlah', jumlah, 'peringkat', peringkat, 'seri', seri)
           order by peringkat, urut, dibuat), '[]'::jsonb)
    into hs from s;

  with t as (
    select c.id, c.ketua || ' & ' || c.wakil as label, null::text as sub, count(s.nim)::int as jumlah, c.urut, c.dibuat
    from calon c left join suara_calon s on s.calon_id = c.id
    where c.tayang group by c.id
  ), r as (
    select *, rank() over (order by jumlah desc)::int as peringkat from t
  ), s as (
    select *, (count(*) over (partition by peringkat)) > 1 as seri from r
  )
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', id, 'label', label, 'sub', sub, 'jumlah', jumlah, 'peringkat', peringkat, 'seri', seri)
           order by peringkat, urut, dibuat), '[]'::jsonb)
    into hc from s;

  return jsonb_build_object(
    'terbuka', true,
    'sayembara', hs,
    'ketua', hc,
    'total_pemilih', (select count(*) from pemilih),
    'memilih_sayembara', (select count(*) from suara_karya),
    'memilih_ketua', (select count(*) from suara_calon)
  );
end $$;

create or replace function cek_pemilih(p_nim text, p_kelas text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare v record;
begin
  select * into v from _verifikasi(p_nim, p_kelas);
  if v.v_err is not null then
    return jsonb_build_object('ok', false, 'error', v.v_err);
  end if;
  return jsonb_build_object(
    'ok', true,
    'fase', _fase(),
    'sudah_sayembara', exists (select 1 from suara_karya where nim = v.v_nim),
    'sudah_ketua', exists (select 1 from suara_calon where nim = v.v_nim)
  );
end $$;

create or replace function kirim_suara(p_nim text, p_kelas text, p_karya uuid, p_calon uuid) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v record; f text; n int;
  r_karya text := 'dilewati';
  r_calon text := 'dilewati';
begin
  f := _fase();
  if f <> 'buka' then
    return jsonb_build_object('ok', false, 'error',
      case f when 'sebelum' then 'belum_dibuka' when 'tutup' then 'sudah_ditutup' else 'dijeda' end);
  end if;

  if p_karya is null and p_calon is null then
    return jsonb_build_object('ok', false, 'error', 'kosong');
  end if;

  select * into v from _verifikasi(p_nim, p_kelas);
  if v.v_err is not null then
    return jsonb_build_object('ok', false, 'error', v.v_err);
  end if;

  if p_karya is not null and not exists (select 1 from karya where id = p_karya and tayang) then
    return jsonb_build_object('ok', false, 'error', 'pilihan_tidak_valid');
  end if;
  if p_calon is not null and not exists (select 1 from calon where id = p_calon and tayang) then
    return jsonb_build_object('ok', false, 'error', 'pilihan_tidak_valid');
  end if;

  if p_karya is not null then
    insert into suara_karya (nim, karya_id) values (v.v_nim, p_karya) on conflict (nim) do nothing;
    get diagnostics n = row_count;
    r_karya := case when n = 1 then 'tercatat' else 'sudah_memilih' end;
  end if;

  if p_calon is not null then
    insert into suara_calon (nim, calon_id) values (v.v_nim, p_calon) on conflict (nim) do nothing;
    get diagnostics n = row_count;
    r_calon := case when n = 1 then 'tercatat' else 'sudah_memilih' end;
  end if;

  return jsonb_build_object('ok', true, 'sayembara', r_karya, 'ketua', r_calon);
end $$;

-- ---------------------------------------------------------------------
-- 4. FUNGSI ADMIN (hanya akun di tabel admin)
-- ---------------------------------------------------------------------
create or replace function _wajib_admin() returns void
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not is_admin() then
    raise exception 'akses_ditolak' using errcode = '42501';
  end if;
end $$;

create or replace function admin_ringkasan() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _wajib_admin();
  return jsonb_build_object(
    'sekarang', now(),
    'fase', _fase(),
    'pengaturan', (select to_jsonb(p) from pengaturan p where id = 1),
    'saya', (select jsonb_build_object('email', email, 'nama', nama, 'auditor', auditor) from admin where user_id = auth.uid()),
    'per_kelas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'kode', k.kode, 'label', k.label,
        'terdaftar', (select count(*) from pemilih p where p.kelas = k.kode),
        'memilih_sayembara', (select count(*) from suara_karya s join pemilih p on p.nim = s.nim where p.kelas = k.kode),
        'memilih_ketua', (select count(*) from suara_calon s join pemilih p on p.nim = s.nim where p.kelas = k.kode)
      ) order by k.urut, k.kode) from kelas k), '[]'::jsonb),
    'total_terdaftar', (select count(*) from pemilih),
    'total_sayembara', (select count(*) from suara_karya),
    'total_ketua', (select count(*) from suara_calon),
    'karya_tayang', (select count(*) from karya where tayang),
    'karya_total', (select count(*) from karya),
    'calon_tayang', (select count(*) from calon where tayang),
    'calon_total', (select count(*) from calon),
    'gagal_1_jam', (select count(*) from percobaan where not ok and waktu > now() - interval '1 hour')
  );
end $$;

-- Daftar pemilih + status sudah/belum memilih (tanpa isi pilihan).
create or replace function admin_daftar_pemilih() returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  perform _wajib_admin();
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'nim', p.nim, 'nama', p.nama, 'kelas', p.kelas,
      'sudah_sayembara', exists (select 1 from suara_karya s where s.nim = p.nim),
      'sudah_ketua', exists (select 1 from suara_calon s where s.nim = p.nim)
    ) order by p.kelas, p.nim)
    from pemilih p), '[]'::jsonb);
end $$;

-- Tempel daftar NIM untuk satu kelas. Satu baris satu mahasiswa:
--   "NIM" atau "NIM, Nama" (pemisah koma, titik koma, tab, atau spasi).
create or replace function admin_impor(p_kelas text, p_baris text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  k text := upper(btrim(coalesce(p_kelas, '')));
  rec text; m text[]; baru boolean;
  tambah int := 0; ubah int := 0; tolak jsonb := '[]'::jsonb;
begin
  perform _wajib_admin();
  if not exists (select 1 from kelas where kode = k) then
    return jsonb_build_object('ok', false, 'error', 'kelas_tidak_dikenal');
  end if;

  for rec in select btrim(x) from regexp_split_to_table(coalesce(p_baris, ''), E'[\\r\\n]+') as x loop
    continue when rec = '';
    m := regexp_match(rec, '^([A-Za-z0-9._-]{4,24})(?:[\s,;]+(.*))?$');
    if m is null then
      tolak := tolak || to_jsonb(left(rec, 80));
      continue;
    end if;
    insert into pemilih (nim, kelas, nama)
      values (upper(m[1]), k, nullif(btrim(coalesce(m[2], '')), ''))
      on conflict (nim) do update
        set kelas = excluded.kelas, nama = coalesce(excluded.nama, pemilih.nama)
      returning (xmax = 0) into baru;
    if baru then tambah := tambah + 1; else ubah := ubah + 1; end if;
  end loop;

  insert into log_audit (aktor, aksi, detail)
    values (aktor_saat_ini(), 'pemilih.impor',
            jsonb_build_object('kelas', k, 'ditambah', tambah, 'diperbarui', ubah, 'ditolak', jsonb_array_length(tolak)));
  return jsonb_build_object('ok', true, 'ditambah', tambah, 'diperbarui', ubah, 'ditolak', tolak);
end $$;

create or replace function admin_hapus_pemilih(p_nim text) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text := upper(btrim(coalesce(p_nim, ''))); c int;
begin
  perform _wajib_admin();
  begin
    delete from pemilih where nim = n;
    get diagnostics c = row_count;
  exception when foreign_key_violation or restrict_violation then
    return jsonb_build_object('ok', false, 'error', 'sudah_memilih');
  end;
  if c = 0 then return jsonb_build_object('ok', false, 'error', 'tidak_ditemukan'); end if;
  insert into log_audit (aktor, aksi, detail) values (aktor_saat_ini(), 'pemilih.hapus', jsonb_build_object('nim', n));
  return jsonb_build_object('ok', true);
end $$;

-- Membuka kunci percobaan salah (semua, atau hanya satu NIM) bila ada
-- mahasiswa sungguhan yang terkunci karena ulah orang lain.
create or replace function admin_buka_kunci(p_nim text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text := nullif(upper(btrim(coalesce(p_nim, ''))), ''); c int;
begin
  perform _wajib_admin();
  delete from percobaan where not ok and (n is null or nim = n);
  get diagnostics c = row_count;
  insert into log_audit (aktor, aksi, detail)
    values (aktor_saat_ini(), 'percobaan.buka_kunci', jsonb_build_object('nim', n, 'baris', c));
  return jsonb_build_object('ok', true, 'dihapus', c);
end $$;

create or replace function admin_atur(p_buka timestamptz, p_tutup timestamptz, p_hasil timestamptz, p_dijeda boolean) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform _wajib_admin();
  if p_buka is null or p_tutup is null or p_hasil is null then
    return jsonb_build_object('ok', false, 'error', 'tanggal_kosong');
  end if;
  if p_buka >= p_tutup then
    return jsonb_build_object('ok', false, 'error', 'buka_harus_sebelum_tutup');
  end if;
  if p_hasil < p_tutup then
    return jsonb_build_object('ok', false, 'error', 'hasil_harus_setelah_tutup');
  end if;
  update pengaturan set buka_at = p_buka, tutup_at = p_tutup, hasil_at = p_hasil, dijeda = coalesce(p_dijeda, false) where id = 1;
  return jsonb_build_object('ok', true);
end $$;

-- Hanya auditor. Setiap pemanggilan dicatat.
create or replace function auditor_suara(p_nim text default null) returns jsonb
language plpgsql security definer set search_path = public, pg_temp as $$
declare n text := nullif(upper(btrim(coalesce(p_nim, ''))), ''); hasil jsonb;
begin
  if not is_auditor() then
    raise exception 'akses_ditolak' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_to_json(x) order by x.waktu), '[]'::jsonb) into hasil from (
    select s.nim, p.nama, p.kelas, 'sayembara'::text as surat,
           k.nama_angkatan || ' (' || k.kelompok || ')' as pilihan, s.waktu
      from suara_karya s join pemilih p on p.nim = s.nim join karya k on k.id = s.karya_id
     where n is null or s.nim = n
    union all
    select s.nim, p.nama, p.kelas, 'ketua'::text,
           c.ketua || ' & ' || c.wakil, s.waktu
      from suara_calon s join pemilih p on p.nim = s.nim join calon c on c.id = s.calon_id
     where n is null or s.nim = n
  ) x;

  insert into log_audit (aktor, aksi, detail)
    values (aktor_saat_ini(), 'auditor.buka_suara',
            jsonb_build_object('nim', n, 'baris', jsonb_array_length(hasil)));
  return hasil;
end $$;

-- ---------------------------------------------------------------------
-- 5. PENCATATAN PERUBAHAN KONTEN (karya, calon, dokumentasi, pengaturan)
-- ---------------------------------------------------------------------
create or replace function audit_trigger() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into log_audit (aktor, aksi, detail) values (
    aktor_saat_ini(),
    tg_table_name || '.' || lower(tg_op),
    jsonb_build_object(
      'lama', case when tg_op <> 'INSERT' then to_jsonb(old) end,
      'baru', case when tg_op <> 'DELETE' then to_jsonb(new) end));
  return coalesce(new, old);
end $$;

drop trigger if exists trg_audit_karya on karya;
create trigger trg_audit_karya after insert or update or delete on karya
  for each row execute function audit_trigger();
drop trigger if exists trg_audit_calon on calon;
create trigger trg_audit_calon after insert or update or delete on calon
  for each row execute function audit_trigger();
drop trigger if exists trg_audit_dokumentasi on dokumentasi;
create trigger trg_audit_dokumentasi after insert or update or delete on dokumentasi
  for each row execute function audit_trigger();
drop trigger if exists trg_audit_pengaturan on pengaturan;
create trigger trg_audit_pengaturan after update on pengaturan
  for each row execute function audit_trigger();

-- ---------------------------------------------------------------------
-- 6. KEAMANAN: RLS + hak akses
-- ---------------------------------------------------------------------
alter table kelas        enable row level security;
alter table pemilih      enable row level security;
alter table karya        enable row level security;
alter table calon        enable row level security;
alter table dokumentasi  enable row level security;
alter table pengaturan   enable row level security;
alter table admin        enable row level security;
alter table suara_karya  enable row level security;
alter table suara_calon  enable row level security;
alter table log_audit    enable row level security;
alter table percobaan    enable row level security;

revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- Panitia (login) membaca dan mengelola konten lewat tabel
grant select on kelas, pemilih, admin, log_audit to authenticated;
grant select, insert, update, delete on karya, calon, dokumentasi to authenticated;

drop policy if exists p_kelas_baca on kelas;
create policy p_kelas_baca on kelas for select to authenticated using (is_admin());

drop policy if exists p_pemilih_baca on pemilih;
create policy p_pemilih_baca on pemilih for select to authenticated using (is_admin());

drop policy if exists p_karya_admin on karya;
create policy p_karya_admin on karya for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists p_calon_admin on calon;
create policy p_calon_admin on calon for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists p_dok_admin on dokumentasi;
create policy p_dok_admin on dokumentasi for all to authenticated using (is_admin()) with check (is_admin());

drop policy if exists p_admin_diri on admin;
create policy p_admin_diri on admin for select to authenticated using (user_id = auth.uid());

drop policy if exists p_log_baca on log_audit;
create policy p_log_baca on log_audit for select to authenticated using (is_admin());

-- Tabel suara, percobaan, pengaturan: tanpa policy = tertutup untuk semua
-- peran API. Hanya fungsi di atas yang bisa menyentuhnya.

-- Hak EXECUTE fungsi: tutup dulu, buka satu per satu
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function status_publik()                         to anon, authenticated;
grant execute on function hasil_publik()                          to anon, authenticated;
grant execute on function cek_pemilih(text, text)                 to anon, authenticated;
grant execute on function kirim_suara(text, text, uuid, uuid)     to anon, authenticated;

grant execute on function is_admin()                              to authenticated;
grant execute on function is_auditor()                            to authenticated;
grant execute on function admin_ringkasan()                       to authenticated;
grant execute on function admin_daftar_pemilih()                  to authenticated;
grant execute on function admin_impor(text, text)                 to authenticated;
grant execute on function admin_hapus_pemilih(text)               to authenticated;
grant execute on function admin_buka_kunci(text)                  to authenticated;
grant execute on function admin_atur(timestamptz, timestamptz, timestamptz, boolean) to authenticated;
grant execute on function auditor_suara(text)                     to authenticated;

-- =====================================================================
-- 7. PENYIMPANAN FOTO (Supabase Storage, bucket publik "narasi")
--    Siapa pun boleh MELIHAT foto; hanya admin yang boleh mengunggah/menghapus.
--    Dilewati otomatis bila skema storage tidak ada (mis. Postgres biasa).
-- =====================================================================
do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice 'Skema storage tidak ditemukan, bagian foto dilewati.';
    return;
  end if;
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('narasi', 'narasi', true, 3145728, array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update set public = true, file_size_limit = 3145728,
    allowed_mime_types = array['image/jpeg','image/png','image/webp'];

  drop policy if exists narasi_admin_tulis  on storage.objects;
  drop policy if exists narasi_admin_ubah   on storage.objects;
  drop policy if exists narasi_admin_hapus  on storage.objects;
  create policy narasi_admin_tulis on storage.objects for insert to authenticated
    with check (bucket_id = 'narasi' and public.is_admin());
  create policy narasi_admin_ubah  on storage.objects for update to authenticated
    using (bucket_id = 'narasi' and public.is_admin()) with check (bucket_id = 'narasi' and public.is_admin());
  create policy narasi_admin_hapus on storage.objects for delete to authenticated
    using (bucket_id = 'narasi' and public.is_admin());
end $$;
