/* NARASI 2026 · panel panitia
   Semua aturan akses ditegakkan di database (lihat supabase/schema.sql).
   Halaman ini hanya antarmuka: menyembunyikan tombol tidak menggantikan izin. */
(function () {
  "use strict";

  var CFG = window.NARASI_CONFIG || {};
  if (CFG.SUPABASE_URL) CFG.SUPABASE_URL = String(CFG.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
  var $ = function (id) { return document.getElementById(id); };
  var panel = $("panel");

  /* ---------- util ---------- */
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k === "value") e.value = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function clear(n) { while (n.firstChild) n.removeChild(n.firstChild); }
  var fmt = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "medium", timeZone: "Asia/Jakarta" });
  var fmtW = function (iso) { return iso ? fmt.format(new Date(iso)) : ""; };
  var sv = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  function toWibInput(iso) { return sv.format(new Date(iso)).replace(" ", "T"); }
  function fromWibInput(v) { return v ? v + (v.length === 16 ? ":00" : "") + "+07:00" : null; }

  function galat(e) {
    if (!e) return "";
    var c = e.code || "", m = e.message || String(e);
    if (c === "42501" || /akses_ditolak/.test(m)) return "Akses ditolak. Akun Anda tidak punya izin untuk tindakan ini.";
    if (c === "23001" || c === "23503") return "Data ini sudah dipakai oleh suara yang masuk, jadi tidak bisa dihapus. Sembunyikan dari galeri (hilangkan centang Tayang) bila perlu.";
    if (c === "23514") return "Isian tidak valid. Tautan harus diawali http:// atau https://.";
    if (/Failed to fetch|NetworkError|jaringan/i.test(m)) return "Tidak bisa terhubung ke server. Periksa koneksi.";
    return m;
  }
  function csv(rows) {
    var q = function (v) { v = v == null ? "" : String(v); if (/^[=+\-@]/.test(v)) v = "'" + v; return '"' + v.replace(/"/g, '""') + '"'; };
    return rows.map(function (r) { return r.map(q).join(","); }).join("\r\n");
  }
  function unduh(nama, teks) {
    var url = URL.createObjectURL(new Blob(["﻿" + teks], { type: "text/csv;charset=utf-8" }));
    var a = h("a", { href: url, download: nama }); document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }
  function tabel(kolom, baris, opsi) {
    opsi = opsi || {};
    var thead = h("thead", null, h("tr", null, kolom.map(function (c) { return h("th", { class: c.num ? "num" : "", text: c.t }); })));
    var tbody = h("tbody", null, baris.map(function (r) { return h("tr", null, r.map(function (cell, i) {
      var td = h("td", { class: (kolom[i].num ? "num " : "") + (kolom[i].wrap ? "wrap" : "") });
      if (cell instanceof Node) td.appendChild(cell); else td.textContent = cell == null ? "" : String(cell);
      return td;
    })); }));
    if (!baris.length) tbody.appendChild(h("tr", null, h("td", { colspan: kolom.length, class: "muted", text: opsi.kosong || "Belum ada data." })));
    return h("div", { class: "tbl-wrap" }, h("table", { class: "tbl" }, [thead, tbody]));
  }
  function pesan(node, teks, ok) { node.textContent = teks || ""; node.className = ok ? "ok-msg" : "form-err"; }

  /* ---------- klien ---------- */
  if (!CFG.SUPABASE_URL || !CFG.SUPABASE_ANON_KEY || !window.supabase) {
    $("login").querySelector(".win-body").appendChild(h("p", { class: "form-err", text: "Backend belum diatur. Isi js/config.js lebih dulu (lihat README)." }));
    $("login-form").hidden = true;
    return;
  }
  var sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false }
  });
  var rpc = function (n, a) { return Promise.resolve(sb.rpc(n, a || {})).catch(function (e) { return { error: e }; }); };

  var ME = null, TAB = "ringkasan", timer = null, seq = 0;

  /* ---------- masuk / keluar ---------- */
  $("login-form").addEventListener("submit", function (ev) {
    ev.preventDefault();
    var err = $("l-err"), btn = $("l-btn");
    var email = $("l-email").value.trim(), pass = $("l-pass").value;
    if (!email || !pass) { pesan(err, "Isi email dan kata sandi."); return; }
    btn.disabled = true; btn.textContent = "Masuk...";
    Promise.resolve(sb.auth.signInWithPassword({ email: email, password: pass })).then(function (r) {
      btn.disabled = false; btn.textContent = "Masuk";
      if (r.error) { pesan(err, "Email atau kata sandi salah."); return; }
      $("l-pass").value = ""; pesan(err, ""); masuk();
    }, function () { btn.disabled = false; btn.textContent = "Masuk"; pesan(err, galat({ message: "jaringan" })); });
  });
  $("adm-out").addEventListener("click", keluar);
  function keluar() {
    clearInterval(timer); ME = null;
    Promise.resolve(sb.auth.signOut()).then(function () {
      $("app").hidden = true; $("adm-me").hidden = true; $("login").hidden = false; clear(panel);
    });
  }

  function masuk() {
    return rpc("admin_ringkasan").then(function (r) {
      if (r.error || !r.data) {
        pesan($("l-err"), /akses_ditolak|42501/.test((r.error && (r.error.message + r.error.code)) || "") ? "Akun ini bukan panitia. Minta pemilik proyek menambahkannya." : galat(r.error));
        $("login").hidden = false; $("app").hidden = true;
        return Promise.resolve(sb.auth.signOut());
      }
      ME = r.data.saya;
      $("login").hidden = true; $("app").hidden = false; $("adm-me").hidden = false;
      $("adm-who").textContent = ME.nama ? ME.nama + " · " + ME.email : ME.email;
      bangunTab(); buka(TAB);
    });
  }

  var TABS = [
    ["ringkasan", "Ringkasan"], ["pemilih", "Pemilih"], ["karya", "Karya"], ["calon", "Calon"],
    ["jadwal", "Jadwal"], ["auditor", "Auditor"], ["log", "Log"]
  ];
  function bangunTab() {
    var nav = $("tabs"); clear(nav);
    TABS.forEach(function (t) {
      if (t[0] === "auditor" && !(ME && ME.auditor)) return;
      nav.appendChild(h("button", { type: "button", "data-tab": t[0], text: t[1], onclick: function () { buka(t[0]); } }));
    });
  }
  function buka(nama) {
    TAB = nama; clearInterval(timer); seq++;
    [].forEach.call($("tabs").children, function (b) { if (b.dataset.tab === nama) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); });
    $("win-name").textContent = nama + ".exe";
    clear(panel);
    panel.appendChild(h("p", { class: "muted", text: "Memuat..." }));
    var mine = seq;
    var jalan = { ringkasan: vRingkasan, pemilih: vPemilih, karya: vKarya, calon: vCalon, jadwal: vJadwal, auditor: vAuditor, log: vLog }[nama];
    Promise.resolve(jalan(function () { return mine === seq; })).catch(function (e) { clear(panel); panel.appendChild(h("p", { class: "form-err", text: galat(e) })); });
  }

  /* ---------- Ringkasan ---------- */
  function vRingkasan(masihAktif) {
    function muat() {
      return rpc("admin_ringkasan").then(function (r) {
        if (!masihAktif()) return;
        if (r.error) throw r.error;
        var d = r.data, p = d.pengaturan;
        clear(panel);
        panel.appendChild(h("h1", { class: "h2", text: "Ringkasan" }));
        var faseTxt = { sebelum: "Belum dibuka", buka: "Voting dibuka", tutup: "Voting ditutup", dijeda: "Dijeda" }[d.fase] || d.fase;
        panel.appendChild(h("p", null, [h("span", { class: "pill " + (d.fase === "buka" ? "on" : ""), text: faseTxt }), " ",
          h("span", { class: "mono muted", text: "Buka " + fmtW(p.buka_at) + " · Tutup " + fmtW(p.tutup_at) + " · Hasil " + fmtW(p.hasil_at) + " WIB" })]));
        var stat = function (n, l) { return h("div", { class: "stat" }, [h("b", { text: n }), h("span", { text: l })]); };
        panel.appendChild(h("div", { class: "adm-grid" }, [
          stat(d.total_terdaftar, "Pemilih terdaftar"),
          stat(d.total_sayembara + " / " + d.total_terdaftar, "Suara sayembara"),
          stat(d.total_ketua + " / " + d.total_terdaftar, "Suara ketua"),
          stat(d.karya_tayang + " / " + d.karya_total, "Karya tayang"),
          stat(d.calon_tayang + " / " + d.calon_total, "Calon tayang"),
          stat(d.gagal_1_jam, "Percobaan gagal (1 jam)")
        ]));
        panel.appendChild(h("h3", { text: "Partisipasi per kelas" }));
        var pc = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "0%"; };
        panel.appendChild(tabel(
          [{ t: "Kelas" }, { t: "Terdaftar", num: true }, { t: "Sayembara", num: true }, { t: "Ketua", num: true }],
          d.per_kelas.map(function (k) { return [k.label, k.terdaftar, k.memilih_sayembara + " (" + pc(k.memilih_sayembara, k.terdaftar) + ")", k.memilih_ketua + " (" + pc(k.memilih_ketua, k.terdaftar) + ")"]; })));
        panel.appendChild(h("p", { class: "adm-note", text: "Ringkasan ini sengaja tidak menampilkan perolehan suara per pilihan. Hasil terbuka otomatis untuk umum pada jadwal hasil." }));

        panel.appendChild(h("h3", { text: "Pemilih terkunci" }));
        panel.appendChild(h("p", { class: "muted", text: "Pemilih yang gagal memasukkan NIM berulang kali dikunci sementara (sekitar 15 menit). Buka kuncinya bila ada mahasiswa sah yang terkunci." }));
        var nim = h("input", { class: "adm-input", id: "k-nim", placeholder: "NIM (kosongkan untuk semua)", "aria-label": "NIM yang dibuka kuncinya", style: "max-width:280px" });
        var info = h("span", { id: "k-info", role: "status" });
        panel.appendChild(h("div", { class: "row" }, [nim, h("button", { type: "button", class: "btn btn-s", text: "Buka kunci", onclick: function () {
          rpc("admin_buka_kunci", { p_nim: nim.value.trim() || null }).then(function (x) {
            if (x.error) pesan(info, galat(x.error)); else pesan(info, x.data.dihapus + " catatan gagal dihapus.", true);
          });
        } }), info]));
      });
    }
    var first = muat();
    timer = setInterval(function () {
      var k = $("k-nim");
      if (!document.hidden && !(k && (k.value || document.activeElement === k))) muat().catch(function () {});
    }, 30000);
    return first;
  }

  /* ---------- Pemilih ---------- */
  function vPemilih(masihAktif) {
    return Promise.all([rpc("admin_daftar_pemilih"), rpc("admin_ringkasan")]).then(function (rs) {
      if (!masihAktif()) return;
      if (rs[0].error) throw rs[0].error;
      var daftar = rs[0].data, kelasList = rs[1].data ? rs[1].data.per_kelas : [];
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: "Pemilih" }));
      panel.appendChild(h("p", { class: "muted", text: "Hanya NIM yang terdaftar di sini yang bisa memilih. Tempel satu NIM per baris, boleh diikuti nama (NIM, Nama). NIM yang sudah ada akan diperbarui kelasnya." }));

      var kelas = h("select", { id: "i-kelas", class: "adm-input", "aria-label": "Kelas" }, kelasList.map(function (k) { return h("option", { value: k.kode, text: k.label }); }));
      var area = h("textarea", { id: "i-area", class: "adm-input", placeholder: "2026001, Nama Mahasiswa\n2026002\n2026003 Nama Lain", "aria-label": "Daftar NIM" });
      var out = h("div", { id: "i-out", role: "status" });
      var btn = h("button", { type: "button", class: "btn", text: "Impor ke kelas ini", onclick: function () {
        if (!area.value.trim()) { pesan(out, "Tempel daftar NIM dulu."); return; }
        btn.disabled = true;
        rpc("admin_impor", { p_kelas: kelas.value, p_baris: area.value }).then(function (x) {
          btn.disabled = false; clear(out);
          if (x.error) { out.appendChild(h("p", { class: "form-err", text: galat(x.error) })); return; }
          if (!x.data.ok) { out.appendChild(h("p", { class: "form-err", text: "Kelas tidak dikenal." })); return; }
          out.appendChild(h("p", { class: "ok-msg", text: x.data.ditambah + " ditambah, " + x.data.diperbarui + " diperbarui, " + x.data.ditolak.length + " ditolak." }));
          if (x.data.ditolak.length) out.appendChild(h("p", { class: "form-err", text: "Baris ditolak (format NIM tidak valid): " + x.data.ditolak.join(" | ") }));
          area.value = ""; setTimeout(function () { if (TAB === "pemilih") buka("pemilih"); }, 1200);
        });
      } });
      panel.appendChild(h("div", { class: "adm-form" }, [
        h("div", { class: "field" }, [h("label", { for: "i-kelas", text: "Kelas" }), kelas]),
        h("div", { class: "field full" }, [h("label", { for: "i-area", text: "Daftar NIM" }), area])
      ]));
      panel.appendChild(h("p", { class: "row" }, [btn, out]));

      var belum = daftar.filter(function (p) { return !p.sudah_sayembara && !p.sudah_ketua; });
      panel.appendChild(h("h3", { text: "Daftar pemilih (" + daftar.length + ")" }));
      panel.appendChild(h("p", { class: "row" }, [
        h("span", { class: "mono muted", text: belum.length + " belum memilih di kedua surat" }),
        h("button", { type: "button", class: "btn alt btn-s", text: "Unduh yang belum memilih (CSV)", onclick: function () {
          unduh("belum-memilih.csv", csv([["NIM", "Nama", "Kelas"]].concat(belum.map(function (p) { return [p.nim, p.nama || "", p.kelas]; }))));
        } }),
        h("button", { type: "button", class: "btn alt btn-s", text: "Unduh semua (CSV)", onclick: function () {
          unduh("pemilih.csv", csv([["NIM", "Nama", "Kelas", "Sudah sayembara", "Sudah ketua"]].concat(daftar.map(function (p) { return [p.nim, p.nama || "", p.kelas, p.sudah_sayembara ? "ya" : "tidak", p.sudah_ketua ? "ya" : "tidak"]; }))));
        } })
      ]));
      var cari = h("input", { class: "adm-input search", type: "search", placeholder: "Cari NIM, nama, atau kelas", "aria-label": "Cari pemilih" });
      var wadah = h("div", null);
      panel.appendChild(cari); panel.appendChild(wadah);
      function gambar() {
        var q = cari.value.trim().toLowerCase();
        var f = daftar.filter(function (p) { return !q || (p.nim + " " + (p.nama || "") + " " + p.kelas).toLowerCase().indexOf(q) >= 0; }).slice(0, 400);
        clear(wadah);
        wadah.appendChild(tabel([{ t: "NIM" }, { t: "Nama", wrap: true }, { t: "Kelas" }, { t: "Sayembara" }, { t: "Ketua" }, { t: "" }],
          f.map(function (p) {
            var del = h("button", { type: "button", class: "btn alt btn-s", text: "Hapus", onclick: function () {
              if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Yakin hapus?"; del.className = "btn btn-d btn-s"; return; }
              rpc("admin_hapus_pemilih", { p_nim: p.nim }).then(function (x) {
                if (x.error) { alert0(galat(x.error)); return; }
                if (!x.data.ok) { del.textContent = x.data.error === "sudah_memilih" ? "Sudah memilih" : "Gagal"; del.disabled = true; return; }
                buka("pemilih");
              });
            } });
            if (p.sudah_sayembara || p.sudah_ketua) { del.disabled = true; del.title = "Sudah memilih, tidak bisa dihapus"; }
            return [p.nim, p.nama || "", p.kelas, h("span", { class: "pill " + (p.sudah_sayembara ? "on" : ""), text: p.sudah_sayembara ? "sudah" : "belum" }),
              h("span", { class: "pill " + (p.sudah_ketua ? "on" : ""), text: p.sudah_ketua ? "sudah" : "belum" }), del];
          }), { kosong: "Belum ada pemilih. Impor daftar NIM di atas." }));
      }
      function alert0(t) { var m = h("p", { class: "form-err", role: "alert", text: t }); wadah.prepend(m); }
      cari.addEventListener("input", gambar); gambar();
    });
  }

  /* ---------- Unggah foto ---------- */
  var BUCKET = "narasi";
  function fotoUrl(path) { return CFG.SUPABASE_URL + "/storage/v1/object/public/" + BUCKET + "/" + path; }
  /* Skala/pangkas di browser sebelum diunggah: rasio [4,5] = potong tengah 960x1200, selain itu sisi terpanjang 1600. */
  function kompres(file, rasio) {
    return new Promise(function (ok, gagal) {
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return gagal(new Error("Berkas harus JPG, PNG, atau WebP."));
      if (file.size > 25 * 1024 * 1024) return gagal(new Error("Berkas terlalu besar (maks 25 MB)."));
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        URL.revokeObjectURL(url);
        var sw = img.naturalWidth, sh = img.naturalHeight, sx = 0, sy = 0, cw, ch;
        if (rasio) {
          cw = 960; ch = 1200;
          var target = rasio[0] / rasio[1];
          if (sw / sh > target) { var nw = Math.round(sh * target); sx = Math.round((sw - nw) / 2); sw = nw; }
          else { var nh = Math.round(sw / target); sy = Math.round((sh - nh) / 2); sh = nh; }
        } else {
          var k = Math.min(1, 1600 / Math.max(sw, sh)); cw = Math.round(sw * k); ch = Math.round(sh * k);
        }
        var cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
        var cx = cv.getContext("2d"); cx.fillStyle = "#fff"; cx.fillRect(0, 0, cw, ch);
        cx.drawImage(img, sx, sy, sw, sh, 0, 0, cw, ch);
        cv.toBlob(function (b) { b ? ok(b) : gagal(new Error("Gagal memproses gambar.")); }, "image/jpeg", 0.86);
      };
      img.onerror = function () { URL.revokeObjectURL(url); gagal(new Error("Berkas bukan gambar yang valid.")); };
      img.src = url;
    });
  }
  function uploader(c, folder) {
    var paths = [], busy = 0, onchange = function () {};
    var strip = h("div", { class: "up-strip" });
    var info = h("p", { class: "muted up-info", role: "status" });
    var inp = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", id: "f-" + c.k, multiple: !!c.multi, class: "up-file" });
    function gambar() {
      clear(strip);
      paths.forEach(function (pth, i) {
        var rm = h("button", { type: "button", class: "up-x", text: "Hapus", "aria-label": "Hapus foto " + (i + 1), onclick: function () { paths.splice(i, 1); gambar(); } });
        strip.appendChild(h("figure", { class: "up-item" + (c.rasio ? " up-45" : "") }, [h("img", { src: fotoUrl(pth), alt: "Foto " + (i + 1) }), rm]));
      });
    }
    inp.addEventListener("change", function () {
      var files = [].slice.call(inp.files || []); inp.value = "";
      if (!files.length) return;
      if (!c.multi) paths = [];
      files.forEach(function (f) {
        busy++; info.textContent = "Mengunggah " + busy + " foto..."; info.className = "muted up-info";
        kompres(f, c.rasio).then(function (blob) {
          var path = folder + "/" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)) + ".jpg";
          return sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" }).then(function (r) {
            if (r.error) throw r.error; paths.push(path); gambar();
          });
        }).catch(function (e) { info.textContent = "Gagal: " + (e && e.message ? e.message : e); info.className = "form-err up-info"; })
          .then(function () { busy--; if (!busy && info.className.indexOf("form-err") < 0) info.textContent = paths.length ? paths.length + " foto siap." : ""; });
      });
    });
    var el = h("div", { class: "up" }, [inp, h("p", { class: "muted up-hint", text: c.rasio ? "Otomatis dipotong ke 4:5 (potret), dari tengah gambar." : "Boleh lebih dari satu. Ukuran diperkecil otomatis." }), strip, info]);
    return {
      el: el,
      sibuk: function () { return busy > 0; },
      ambil: function () { return c.multi ? paths.slice() : (paths[0] || null); },
      isi: function (v) { paths = v ? [].concat(v) : []; info.textContent = ""; info.className = "muted up-info"; gambar(); }
    };
  }

  /* ---------- Karya & Calon (CRUD generik) ---------- */
  function crud(masihAktif, cfg) {
    return Promise.resolve(sb.from(cfg.tabel).select("*").order("urut", { ascending: true }).order("dibuat", { ascending: true })).then(function (r) {
      if (!masihAktif()) return;
      if (r.error) throw r.error;
      var rows = r.data || [], edit = null;
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: cfg.judul }));
      panel.appendChild(h("p", { class: "muted", text: cfg.bantuan }));
      var form = h("form", { class: "adm-form", novalidate: true });
      var fields = {};
      var ups = {};
      cfg.kolom.forEach(function (c) {
        if (c.img) {
          ups[c.k] = uploader(c, cfg.tabel);
          form.appendChild(h("div", { class: "field full" }, [h("label", { for: "f-" + c.k, text: c.t }), ups[c.k].el]));
          return;
        }
        var inp = c.area ? h("textarea", { class: "adm-input", id: "f-" + c.k, rows: "3" }) : h("input", { class: "adm-input", id: "f-" + c.k, type: c.num ? "number" : (c.url ? "url" : "text"), placeholder: c.ph || "" });
        fields[c.k] = inp;
        form.appendChild(h("div", { class: "field" + (c.full ? " full" : "") }, [h("label", { for: "f-" + c.k, text: c.t + (c.req ? " *" : "") }), inp]));
      });
      var tayang = h("input", { type: "checkbox", id: "f-tayang" });
      form.appendChild(h("div", { class: "field full" }, h("label", { class: "chk", for: "f-tayang" }, [tayang, "Tayang di situs publik dan bisa dipilih"])));
      var msg = h("p", { role: "status", class: "full" });
      var simpan = h("button", { type: "submit", class: "btn", text: "Tambah" });
      var batal = h("button", { type: "button", class: "btn alt", text: "Batal edit", hidden: true, onclick: function () { reset(); } });
      form.appendChild(h("div", { class: "full row" }, [simpan, batal, msg]));
      function reset() { edit = null; form.reset(); Object.keys(ups).forEach(function (k) { ups[k].isi(null); }); simpan.textContent = "Tambah"; batal.hidden = true; pesan(msg, ""); }
      form.addEventListener("submit", function (ev) {
        ev.preventDefault();
        var data = { tayang: tayang.checked };
        for (var uk in ups) { if (ups[uk].sibuk()) { pesan(msg, "Tunggu sampai unggahan foto selesai."); return; } }
        for (var i = 0; i < cfg.kolom.length; i++) {
          var c = cfg.kolom[i];
          if (c.img) { data[c.k] = ups[c.k].ambil(); continue; }
          var v = fields[c.k].value.trim();
          if (c.req && !v) { pesan(msg, c.t + " wajib diisi."); fields[c.k].focus(); return; }
          if (c.url && v && !/^https?:\/\//i.test(v)) { pesan(msg, c.t + " harus diawali http:// atau https://"); fields[c.k].focus(); return; }
          data[c.k] = c.num ? (parseInt(v, 10) || 0) : (v || null);
        }
        simpan.disabled = true;
        var q = edit ? sb.from(cfg.tabel).update(data).eq("id", edit) : sb.from(cfg.tabel).insert(data);
        Promise.resolve(q).then(function (x) {
          simpan.disabled = false;
          if (x.error) { pesan(msg, galat(x.error)); return; }
          buka(TAB);
        });
      });
      panel.appendChild(form);

      panel.appendChild(h("h3", { text: "Daftar (" + rows.length + ")" }));
      panel.appendChild(tabel([{ t: "Urut", num: true }].concat(cfg.tampil.map(function (c) { return { t: c.t, wrap: true }; })).concat([{ t: "Status" }, { t: "" }]),
        rows.map(function (row) {
          var ubah = h("button", { type: "button", class: "btn alt btn-s", text: "Edit", onclick: function () {
            edit = row.id; cfg.kolom.forEach(function (c) { if (c.img) ups[c.k].isi(row[c.k]); else fields[c.k].value = row[c.k] == null ? "" : row[c.k]; });
            tayang.checked = !!row.tayang; simpan.textContent = "Simpan perubahan"; batal.hidden = false; form.scrollIntoView({ behavior: "smooth", block: "start" }); (fields[cfg.kolom[0].k] || { focus: function () {} }).focus();
          } });
          var sw = h("button", { type: "button", class: "btn alt btn-s", text: row.tayang ? "Sembunyikan" : "Tayangkan", onclick: function () {
            Promise.resolve(sb.from(cfg.tabel).update({ tayang: !row.tayang }).eq("id", row.id)).then(function (x) { if (x.error) pesan(msg, galat(x.error)); else buka(TAB); });
          } });
          var del = h("button", { type: "button", class: "btn alt btn-s", text: "Hapus", onclick: function () {
            if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Yakin hapus?"; del.className = "btn btn-d btn-s"; return; }
            Promise.resolve(sb.from(cfg.tabel).delete().eq("id", row.id)).then(function (x) { if (x.error) pesan(msg, galat(x.error)); else buka(TAB); });
          } });
          return [row.urut].concat(cfg.tampil.map(function (c) { return c.f(row); })).concat([
            h("span", { class: "pill " + (row.tayang ? "on" : ""), text: row.tayang ? "tayang" : "draf" }), h("span", { class: "act" }, [ubah, sw, del])]);
        }), { kosong: "Belum ada data. Tambahkan lewat formulir di atas." }));
    });
  }
  function vKarya(a) {
    return crud(a, {
      tabel: "karya", judul: "Karya Sayembara",
      bantuan: "Satu baris = satu paket identitas dari satu kelompok. Foto (logo, bendera, dll) diunggah langsung dan tampil di situs. Video: unggah dulu ke YouTube lalu tempel tautannya, video akan bisa diputar di situs. Hanya karya yang Tayang yang tampil dan bisa dipilih.",
      kolom: [
        { k: "kelompok", t: "Kelompok", req: true, ph: "Kelompok 1" },
        { k: "nama_angkatan", t: "Nama angkatan", req: true },
        { k: "slogan", t: "Slogan", full: true },
        { k: "filosofi", t: "Filosofi singkat", area: true, full: true },
        { k: "foto", t: "Foto karya (logo, bendera, dll)", img: true, multi: true },
        { k: "tautan_video", t: "Tautan video YouTube", url: true, ph: "https://www.youtube.com/watch?v=..." },
        { k: "tautan_paket", t: "Tautan paket karya (opsional: Drive/IG)", url: true, ph: "https://" },
        { k: "urut", t: "Urutan tampil", num: true, ph: "0" }
      ],
      tampil: [{ t: "Kelompok", f: function (r) { return r.kelompok; } }, { t: "Nama", f: function (r) { return r.nama_angkatan; } }, { t: "Foto", f: function (r) { return (r.foto || []).length ? h("img", { class: "tbl-img", src: fotoUrl(r.foto[0]), alt: "" }) : "–"; } }, { t: "Video", f: function (r) { return r.tautan_video ? "ya" : "–"; } }]
    });
  }
  function vCalon(a) {
    return crud(a, {
      tabel: "calon", judul: "Pasangan Calon",
      bantuan: "Satu baris = satu pasangan Ketua dan Wakil. Foto masing-masing otomatis dipotong ke 4:5. Hanya calon yang Tayang yang tampil dan bisa dipilih.",
      kolom: [
        { k: "ketua", t: "Calon Ketua", req: true },
        { k: "wakil", t: "Calon Wakil Ketua", req: true },
        { k: "foto_ketua", t: "Foto Calon Ketua (4:5)", img: true, rasio: [4, 5] },
        { k: "foto_wakil", t: "Foto Calon Wakil Ketua (4:5)", img: true, rasio: [4, 5] },
        { k: "visi", t: "Visi singkat", area: true, full: true },
        { k: "tautan_kampanye", t: "Tautan video kampanye", url: true, ph: "https://" },
        { k: "urut", t: "Urutan tampil", num: true, ph: "0" }
      ],
      tampil: [{ t: "Pasangan", f: function (r) { return r.ketua + " & " + r.wakil; } }, { t: "Foto", f: function (r) { return h("span", { class: "tbl-pair" }, [r.foto_ketua ? h("img", { class: "tbl-img", src: fotoUrl(r.foto_ketua), alt: "" }) : "–", r.foto_wakil ? h("img", { class: "tbl-img", src: fotoUrl(r.foto_wakil), alt: "" }) : "–"]); } }, { t: "Visi", f: function (r) { return r.visi || ""; } }]
    });
  }

  /* ---------- Jadwal ---------- */
  function vJadwal(masihAktif) {
    return rpc("admin_ringkasan").then(function (r) {
      if (!masihAktif()) return;
      if (r.error) throw r.error;
      var p = r.data.pengaturan;
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: "Jadwal Voting" }));
      panel.appendChild(h("p", { class: "muted", text: "Semua waktu dalam WIB. Server yang menegakkan jadwal, jadi suara di luar jam buka otomatis ditolak." }));
      var mk = function (id, l, v) { var i = h("input", { id: id, class: "adm-input", type: "datetime-local", step: "1", value: toWibInput(v) }); return [h("div", { class: "field" }, [h("label", { for: id, text: l }), i]), i]; };
      var b = mk("j-buka", "Voting dibuka", p.buka_at), t = mk("j-tutup", "Voting ditutup", p.tutup_at), hs = mk("j-hasil", "Hasil terbuka otomatis", p.hasil_at);
      var dj = h("input", { type: "checkbox", id: "j-dijeda" }); dj.checked = !!p.dijeda;
      var msg = h("p", { role: "status" });
      var save = h("button", { type: "button", class: "btn", text: "Simpan jadwal", onclick: function () {
        save.disabled = true;
        rpc("admin_atur", { p_buka: fromWibInput(b[1].value), p_tutup: fromWibInput(t[1].value), p_hasil: fromWibInput(hs[1].value), p_dijeda: dj.checked }).then(function (x) {
          save.disabled = false;
          if (x.error) { pesan(msg, galat(x.error)); return; }
          if (!x.data.ok) { pesan(msg, { buka_harus_sebelum_tutup: "Waktu buka harus sebelum waktu tutup.", hasil_harus_setelah_tutup: "Waktu hasil tidak boleh sebelum voting ditutup.", tanggal_kosong: "Semua tanggal wajib diisi." }[x.data.error] || "Gagal menyimpan."); return; }
          pesan(msg, "Jadwal disimpan.", true);
        });
      } });
      panel.appendChild(h("div", { class: "adm-form" }, [b[0], t[0], hs[0],
        h("div", { class: "field full" }, h("label", { class: "chk", for: "j-dijeda" }, [dj, "Jeda voting sementara (tombol darurat)"]))]));
      panel.appendChild(h("p", { class: "row" }, [save, msg]));
      panel.appendChild(h("p", { class: "adm-note warn-n", text: "Mengubah jadwal saat voting berjalan tercatat di Log. Hasil tidak pernah terbuka sebelum voting ditutup, berapa pun nilai waktu hasil." }));
    });
  }

  /* ---------- Auditor ---------- */
  function vAuditor(masihAktif) {
    clear(panel);
    panel.appendChild(h("h1", { class: "h2", text: "Auditor" }));
    panel.appendChild(h("p", { class: "adm-note warn-n", text: "Daftar ini memperlihatkan siapa memilih siapa. Gunakan hanya untuk menyelesaikan sengketa. Setiap pembukaan dicatat di Log dengan nama akun Anda." }));
    var nim = h("input", { class: "adm-input", id: "a-nim", placeholder: "NIM (kosongkan untuk semua suara)", "aria-label": "NIM", style: "max-width:320px" });
    var hasil = h("div", { role: "status" });
    var go = h("button", { type: "button", class: "btn", text: "Buka daftar suara", onclick: function () {
      go.disabled = true; clear(hasil);
      rpc("auditor_suara", { p_nim: nim.value.trim() || null }).then(function (x) {
        go.disabled = false;
        if (x.error) { hasil.appendChild(h("p", { class: "form-err", text: galat(x.error) })); return; }
        var rows = x.data || [];
        hasil.appendChild(h("p", { class: "row" }, [h("span", { class: "mono muted", text: rows.length + " suara" }),
          h("button", { type: "button", class: "btn alt btn-s", text: "Unduh CSV", onclick: function () {
            unduh("audit-suara.csv", csv([["NIM", "Nama", "Kelas", "Surat", "Pilihan", "Waktu"]].concat(rows.map(function (r) { return [r.nim, r.nama || "", r.kelas, r.surat, r.pilihan, r.waktu]; }))));
          } })]));
        hasil.appendChild(tabel([{ t: "NIM" }, { t: "Nama", wrap: true }, { t: "Kelas" }, { t: "Surat" }, { t: "Pilihan", wrap: true }, { t: "Waktu" }],
          rows.map(function (r) { return [r.nim, r.nama || "", r.kelas, r.surat, r.pilihan, fmtW(r.waktu)]; })));
      });
    } });
    panel.appendChild(h("div", { class: "row" }, [nim, go]));
    panel.appendChild(hasil);
  }

  /* ---------- Log ---------- */
  function vLog(masihAktif) {
    return Promise.resolve(sb.from("log_audit").select("*").order("id", { ascending: false }).limit(300)).then(function (r) {
      if (!masihAktif()) return;
      if (r.error) throw r.error;
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: "Log" }));
      panel.appendChild(h("p", { class: "muted", text: "300 catatan terakhir: perubahan jadwal, karya, calon, pemilih, dan setiap akses auditor." }));
      panel.appendChild(tabel([{ t: "Waktu" }, { t: "Akun" }, { t: "Tindakan" }, { t: "Rincian", wrap: true }],
        (r.data || []).map(function (l) {
          var d = l.detail ? JSON.stringify(l.detail) : "";
          return [fmtW(l.waktu), l.aktor, l.aksi, h("span", { class: "json", text: d.length > 260 ? d.slice(0, 260) + "…" : d })];
        })));
    });
  }

  /* ---------- mulai ---------- */
  Promise.resolve(sb.auth.getSession()).then(function (r) {
    if (r && r.data && r.data.session) masuk();
  });
})();
