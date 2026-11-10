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
    if (c === "23514") return "Isian tidak valid. Periksa panjang teks, urutan jam, atau tautan (harus diawali http:// atau https://).";
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
    ["ringkasan", "Ringkasan"], ["pemilih", "Pemilih"], ["karya", "Karya"], ["calon", "Calon"], ["acara", "Acara"], ["pemateri", "Pemateri"], ["dokumentasi", "Dokumentasi"],
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
    var jalan = { ringkasan: vRingkasan, pemilih: vPemilih, karya: vKarya, calon: vCalon, acara: vAcara, pemateri: vPemateri, dokumentasi: vDokumentasi, jadwal: vJadwal, auditor: vAuditor, log: vLog }[nama];
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
        var inp = c.area ? h("textarea", { class: "adm-input", id: "f-" + c.k, rows: c.rows || "3", placeholder: c.ph || "" }) : h("input", { class: "adm-input", id: "f-" + c.k, type: c.num ? "number" : (c.url ? "url" : "text"), placeholder: c.ph || "" });
        fields[c.k] = inp;
        form.appendChild(h("div", { class: "field" + (c.full ? " full" : "") }, [h("label", { for: "f-" + c.k, text: c.t + (c.req ? " *" : "") }), inp, c.hint ? h("p", { class: "muted up-hint", text: c.hint }) : null]));
      });
      var tayang = h("input", { type: "checkbox", id: "f-tayang" });
      form.appendChild(h("div", { class: "field full" }, h("label", { class: "chk", for: "f-tayang" }, [tayang, cfg.labelTayang || "Tayang di situs publik dan bisa dipilih"])));
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
        { k: "misi", t: "Misi", area: true, full: true, rows: "4", ph: "Satu misi per baris", hint: "Satu misi per baris. Tampil sebagai daftar bernomor." },
        { k: "proker", t: "Program kerja singkat", area: true, full: true, rows: "4", ph: "Satu program per baris", hint: "Satu program per baris, singkat saja." },
        { k: "tautan_kampanye", t: "Tautan video kampanye", url: true, ph: "https://" },
        { k: "urut", t: "Urutan tampil", num: true, ph: "0" }
      ],
      tampil: [{ t: "Pasangan", f: function (r) { return r.ketua + " & " + r.wakil; } }, { t: "Foto", f: function (r) { return h("span", { class: "tbl-pair" }, [r.foto_ketua ? h("img", { class: "tbl-img", src: fotoUrl(r.foto_ketua), alt: "" }) : "–", r.foto_wakil ? h("img", { class: "tbl-img", src: fotoUrl(r.foto_wakil), alt: "" }) : "–"]); } }, { t: "Visi", f: function (r) { return r.visi || ""; } }, { t: "Misi/Proker", f: function (r) { var n = function (x) { return x ? x.split(/\n+/).filter(function (l) { return l.trim(); }).length : 0; }; return n(r.misi) + " misi · " + n(r.proker) + " proker"; } }]
    });
  }
  function vPemateri(a) {
    return crud(a, {
      tabel: "pemateri", judul: "Pemateri Seminar", labelTayang: "Tayang di halaman About",
      bantuan: "Kartu pemateri di halaman About menampilkan foto, nama, dan judul materi. Foto otomatis dipotong ke 4:5 dari tengah gambar. Jam tampil tiap pemateri diatur di tab Acara (rundown).",
      kolom: [
        { k: "nama", t: "Nama pemateri", req: true },
        { k: "judul", t: "Judul materi", full: true, ph: "Personal Branding: Value to Impact" },
        { k: "foto", t: "Foto pemateri (4:5)", img: true, rasio: [4, 5] },
        { k: "urut", t: "Urutan tampil", num: true, ph: "1" }
      ],
      tampil: [{ t: "Nama", f: function (r) { return r.nama; } }, { t: "Judul", f: function (r) { return r.judul || "–"; } }, { t: "Foto", f: function (r) { return r.foto ? h("img", { class: "tbl-img", src: fotoUrl(r.foto), alt: "" }) : "–"; } }]
    });
  }

  /* ---------- Acara puncak: tanggal, jam, lokasi, rundown ---------- */
  var JENIS = [["biasa", "Biasa"], ["pemateri", "Pemateri"], ["hiburan", "Hiburan / games"], ["pengumuman", "Pengumuman"]];
  function vAcara(masihAktif) {
    return Promise.all([rpc("admin_ringkasan"), Promise.resolve(sb.from("rundown").select("*").order("mulai", { ascending: true }).order("dibuat", { ascending: true }))]).then(function (rs) {
      if (!masihAktif()) return;
      if (rs[0].error) throw rs[0].error;
      var p = rs[0].data.pengaturan;
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: "Acara Puncak" }));
      if (rs[1].error || p.acara_mulai === undefined) {
        panel.appendChild(h("p", { class: "form-err", text: "Pengaturan acara belum ada di database. Jalankan ulang seluruh supabase/schema.sql di SQL Editor (aman, data tidak terhapus), lalu muat ulang halaman ini." }));
        return;
      }
      panel.appendChild(h("p", { class: "muted", text: "Tanggal, jam, dan lokasi ini dipakai hitung mundur di Home, info hari-H, dan rundown di About. Semua jam dalam WIB." }));
      var m = toWibInput(p.acara_mulai), sl = toWibInput(p.acara_selesai);
      var tgl = h("input", { id: "a-tgl", class: "adm-input", type: "date", value: m.slice(0, 10) });
      var jm = h("input", { id: "a-mulai", class: "adm-input", type: "time", value: m.slice(11, 16) });
      var js = h("input", { id: "a-selesai", class: "adm-input", type: "time", value: sl.slice(11, 16) });
      var lok = h("input", { id: "a-lokasi", class: "adm-input", type: "text", maxlength: "120", value: p.acara_lokasi });
      var msg = h("p", { role: "status" });
      var f = function (id, l, i) { return h("div", { class: "field" }, [h("label", { for: id, text: l }), i]); };
      var save = h("button", { type: "button", class: "btn", id: "a-simpan", text: "Simpan acara", onclick: function () {
        if (!tgl.value || !jm.value || !js.value) { pesan(msg, "Tanggal dan jam wajib diisi."); return; }
        save.disabled = true;
        rpc("admin_atur_acara", { p_mulai: fromWibInput(tgl.value + "T" + jm.value), p_selesai: fromWibInput(tgl.value + "T" + js.value), p_lokasi: lok.value }).then(function (x) {
          save.disabled = false;
          if (x.error) { pesan(msg, galat(x.error)); return; }
          if (!x.data.ok) { pesan(msg, { mulai_harus_sebelum_selesai: "Jam mulai harus sebelum jam selesai.", lokasi_tidak_valid: "Lokasi wajib diisi (maks. 120 karakter).", tanggal_kosong: "Tanggal dan jam wajib diisi." }[x.data.error] || "Gagal menyimpan."); return; }
          pesan(msg, "Acara disimpan.", true);
        });
      } });
      panel.appendChild(h("div", { class: "adm-form" }, [f("a-tgl", "Tanggal", tgl), f("a-lokasi", "Lokasi", lok), f("a-mulai", "Jam mulai", jm), f("a-selesai", "Jam selesai", js)]));
      panel.appendChild(h("p", { class: "row" }, [save, msg]));

      // Rundown
      // urutan sama dengan situs: jam mulai, lalu jam selesai (penanda tanpa jam selesai di akhir)
      var rows = (rs[1].data || []).slice().sort(function (x, y) {
        var a = String(x.mulai), b = String(y.mulai);
        if (a !== b) return a < b ? -1 : 1;
        if (!x.selesai !== !y.selesai) return x.selesai ? -1 : 1;
        return String(x.selesai || "") < String(y.selesai || "") ? -1 : String(x.selesai || "") > String(y.selesai || "") ? 1 : 0;
      });
      var rmsg = h("p", { role: "status", id: "r-msg" });
      panel.appendChild(h("h3", { text: "Rundown (" + rows.length + " kegiatan)" }));
      panel.appendChild(h("p", { class: "muted", text: "Urutan otomatis mengikuti jam mulai. Kosongkan jam selesai untuk penanda seperti \"Selesai\". Jenis Pemateri, Hiburan, dan Pengumuman diberi warna penanda di situs." }));
      panel.appendChild(rmsg);
      function barisInput(row) {
        var sel = h("select", { class: "adm-input", "aria-label": "Jenis" }, JENIS.map(function (j) { return h("option", { value: j[0], text: j[1] }); }));
        sel.value = (row && row.jenis) || "biasa";
        return {
          mulai: h("input", { class: "adm-input", type: "time", "aria-label": "Jam mulai", value: row ? String(row.mulai).slice(0, 5) : "" }),
          selesai: h("input", { class: "adm-input", type: "time", "aria-label": "Jam selesai", value: row && row.selesai ? String(row.selesai).slice(0, 5) : "" }),
          kegiatan: h("input", { class: "adm-input", type: "text", maxlength: "80", "aria-label": "Kegiatan", placeholder: "Kegiatan", value: row ? row.kegiatan : "" }),
          keterangan: h("input", { class: "adm-input", type: "text", maxlength: "120", "aria-label": "Keterangan", placeholder: "Keterangan (opsional)", value: row && row.keterangan ? row.keterangan : "" }),
          jenis: sel
        };
      }
      function data(b) {
        if (!b.mulai.value || !b.kegiatan.value.trim()) return null;
        return { mulai: b.mulai.value, selesai: b.selesai.value || null, kegiatan: b.kegiatan.value.trim(), keterangan: b.keterangan.value.trim() || null, jenis: b.jenis.value };
      }
      var list = h("div", { class: "run-ed" });
      rows.forEach(function (row) {
        var b = barisInput(row);
        var simpan = h("button", { type: "button", class: "btn btn-s", text: "Simpan", onclick: function () {
          var d = data(b); if (!d) { pesan(rmsg, "Jam mulai dan kegiatan wajib diisi."); return; }
          simpan.disabled = true;
          Promise.resolve(sb.from("rundown").update(d).eq("id", row.id)).then(function (x) {
            simpan.disabled = false;
            if (x.error) { pesan(rmsg, galat(x.error)); return; }
            if (d.mulai !== String(row.mulai).slice(0, 5)) { buka(TAB); return; }
            simpan.textContent = "Tersimpan"; setTimeout(function () { simpan.textContent = "Simpan"; }, 1500);
          });
        } });
        var del = h("button", { type: "button", class: "btn alt btn-s", text: "Hapus", onclick: function () {
          if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Yakin?"; del.className = "btn btn-d btn-s"; return; }
          Promise.resolve(sb.from("rundown").delete().eq("id", row.id)).then(function (x) { if (x.error) pesan(rmsg, galat(x.error)); else buka(TAB); });
        } });
        list.appendChild(h("div", { class: "run-row" }, [b.mulai, b.selesai, b.kegiatan, b.keterangan, b.jenis, h("span", { class: "act" }, [simpan, del])]));
      });
      var nb = barisInput(null);
      var tambah = h("button", { type: "button", class: "btn btn-s", id: "r-tambah", text: "Tambah", onclick: function () {
        var d = data(nb); if (!d) { pesan(rmsg, "Jam mulai dan kegiatan wajib diisi."); return; }
        tambah.disabled = true;
        Promise.resolve(sb.from("rundown").insert(d)).then(function (x) { tambah.disabled = false; if (x.error) pesan(rmsg, galat(x.error)); else buka(TAB); });
      } });
      list.appendChild(h("div", { class: "run-row run-new" }, [nb.mulai, nb.selesai, nb.kegiatan, nb.keterangan, nb.jenis, h("span", { class: "act" }, [tambah])]));
      panel.appendChild(h("div", { class: "run-head mono muted", "aria-hidden": "true" }, ["Mulai", "Selesai", "Kegiatan", "Keterangan", "Jenis", ""].map(function (t) { return h("span", { text: t }); })));
      panel.appendChild(list);
    });
  }

  /* ---------- Dokumentasi (kartu berjalan di Home) ---------- */
  function vDokumentasi(masihAktif) {
    return Promise.resolve(sb.from("dokumentasi").select("*").order("urut", { ascending: true }).order("dibuat", { ascending: true })).then(function (r) {
      if (!masihAktif()) return;
      if (r.error) {
        if (/dokumentasi/.test(r.error.message || "") && /exist|schema cache|not find/i.test(r.error.message || "")) {
          clear(panel);
          panel.appendChild(h("h1", { class: "h2", text: "Dokumentasi" }));
          panel.appendChild(h("p", { class: "form-err", text: "Tabel dokumentasi belum ada. Jalankan ulang seluruh supabase/schema.sql di SQL Editor (aman, data tidak terhapus), lalu muat ulang halaman ini." }));
          return;
        }
        throw r.error;
      }
      var rows = r.data || [];
      clear(panel);
      panel.appendChild(h("h1", { class: "h2", text: "Dokumentasi" }));
      panel.appendChild(h("p", { class: "muted", text: "Foto di sini tampil sebagai kartu berjalan di halaman Home. Pilih beberapa foto sekaligus; ukurannya diperkecil otomatis dan langsung tayang. Selama belum ada foto tayang, Home memakai 4 foto bawaan." }));
      var inp = h("input", { type: "file", accept: "image/jpeg,image/png,image/webp", multiple: true, id: "d-file", class: "up-file" });
      var info = h("p", { class: "muted up-info", role: "status", id: "d-info" });
      var maxUrut = rows.reduce(function (m, x) { return Math.max(m, x.urut || 0); }, 0);
      inp.addEventListener("change", function () {
        var files = [].slice.call(inp.files || []); inp.value = "";
        if (!files.length) return;
        var sisa = files.length, gagal = [];
        info.className = "muted up-info"; info.textContent = "Mengunggah " + sisa + " foto...";
        files.forEach(function (f, i) {
          kompres(f, null).then(function (blob) {
            var path = "dokumentasi/" + (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2)) + ".jpg";
            return Promise.resolve(sb.storage.from(BUCKET).upload(path, blob, { contentType: "image/jpeg", cacheControl: "31536000" })).then(function (u) {
              if (u.error) throw u.error;
              return Promise.resolve(sb.from("dokumentasi").insert({ foto: path, urut: maxUrut + 1 + i, tayang: true })).then(function (x) { if (x.error) throw x.error; });
            });
          }).catch(function (e) { gagal.push(f.name + ": " + (e && e.message ? e.message : galat(e))); })
            .then(function () {
              sisa--;
              if (sisa > 0) { info.textContent = "Mengunggah " + sisa + " foto..."; return; }
              if (gagal.length) { info.className = "form-err up-info"; info.textContent = "Sebagian gagal: " + gagal.join(" | "); setTimeout(function () { if (TAB === "dokumentasi") buka("dokumentasi"); }, 2500); }
              else buka("dokumentasi");
            });
        });
      });
      panel.appendChild(h("div", { class: "adm-form" }, [
        h("div", { class: "field full" }, [h("label", { for: "d-file", text: "Tambah foto" }), h("div", { class: "up" }, [inp, h("p", { class: "muted up-hint", text: "JPG, PNG, atau WebP. Boleh banyak sekaligus." }), info])])
      ]));
      var msg = h("p", { role: "status", id: "d-msg" });
      panel.appendChild(h("h3", { text: "Foto (" + rows.length + ") · " + rows.filter(function (x) { return x.tayang; }).length + " tayang" }));
      panel.appendChild(msg);
      if (!rows.length) { panel.appendChild(h("p", { class: "muted", text: "Belum ada foto. Home sementara memakai 4 foto bawaan." })); return; }
      panel.appendChild(h("div", { class: "dok-grid" }, rows.map(function (row) {
        var ket = h("input", { class: "adm-input", type: "text", maxlength: "120", value: row.keterangan || "", placeholder: "Keterangan (opsional)", "aria-label": "Keterangan foto" });
        var urut = h("input", { class: "adm-input dok-urut", type: "number", value: String(row.urut), "aria-label": "Urutan" });
        var simpan = h("button", { type: "button", class: "btn btn-s", text: "Simpan", onclick: function () {
          simpan.disabled = true;
          Promise.resolve(sb.from("dokumentasi").update({ keterangan: ket.value.trim() || null, urut: parseInt(urut.value, 10) || 0 }).eq("id", row.id)).then(function (x) {
            simpan.disabled = false;
            if (x.error) pesan(msg, galat(x.error)); else { simpan.textContent = "Tersimpan"; setTimeout(function () { simpan.textContent = "Simpan"; }, 1500); }
          });
        } });
        var sw = h("button", { type: "button", class: "btn alt btn-s", text: row.tayang ? "Sembunyikan" : "Tayangkan", onclick: function () {
          Promise.resolve(sb.from("dokumentasi").update({ tayang: !row.tayang }).eq("id", row.id)).then(function (x) { if (x.error) pesan(msg, galat(x.error)); else buka(TAB); });
        } });
        var del = h("button", { type: "button", class: "btn alt btn-s", text: "Hapus", onclick: function () {
          if (del.dataset.sure !== "1") { del.dataset.sure = "1"; del.textContent = "Yakin hapus?"; del.className = "btn btn-d btn-s"; return; }
          Promise.resolve(sb.from("dokumentasi").delete().eq("id", row.id)).then(function (x) {
            if (x.error) { pesan(msg, galat(x.error)); return; }
            Promise.resolve(sb.storage.from(BUCKET).remove([row.foto])).catch(function () {}).then(function () { buka(TAB); });
          });
        } });
        return h("figure", { class: "dok-item" + (row.tayang ? "" : " draf") }, [
          h("img", { src: fotoUrl(row.foto), alt: row.keterangan || "Foto dokumentasi", loading: "lazy" }),
          h("figcaption", null, [
            h("span", { class: "pill " + (row.tayang ? "on" : ""), text: row.tayang ? "tayang" : "draf" }),
            ket, h("label", { class: "dok-u" }, [h("span", { class: "mono muted", text: "Urut" }), urut]),
            h("span", { class: "act" }, [simpan, sw, del])])
        ]);
      })));
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
  /* Warna seri (divalidasi: kontras, buta warna, mode terang & gelap). Warna mengikuti surat suara, bukan peringkat. */
  var WARNA_S = { sayembara: "#008C83", ketua: "#C65A32" };
  var NAMA_S = { sayembara: "Sayembara", ketua: "Ketua & Wakil" };
  var SVGNS = "http://www.w3.org/2000/svg";
  function sv2(tag, attrs, kids) {
    var e = document.createElementNS(SVGNS, tag);
    Object.keys(attrs || {}).forEach(function (k) { if (attrs[k] != null) e.setAttribute(k, attrs[k]); });
    [].concat(kids || []).forEach(function (c) { if (c) e.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return e;
  }
  var pct = function (a, b) { return b ? Math.round(a / b * 1000) / 10 : 0; };
  var fmtPct = function (v) { return String(v).replace(".", ",") + "%"; };
  var fmtJamW = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
  var fmtHariW = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", timeZone: "Asia/Jakarta" });
  var fmtTglW = new Intl.DateTimeFormat("id-ID", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Jakarta" });
  var fmtDetik = new Intl.DateTimeFormat("id-ID", { hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });

  /* Satu tooltip untuk semua grafik: nilai di depan (tebal), keterangan di belakang. */
  var TIP = null;
  function tip() { if (!TIP || !document.body.contains(TIP)) { TIP = h("div", { class: "rk-tip", role: "tooltip", hidden: true }); document.body.appendChild(TIP); } return TIP; }
  function tampilTip(baris, x, y) {
    var t = tip(); clear(t);
    baris.forEach(function (b) {
      t.appendChild(h("div", { class: "rk-tip-r" }, [b.warna ? h("i", { class: "rk-key", style: "background:" + b.warna }) : null, h("b", { text: b.nilai }), b.ket ? h("span", { text: b.ket }) : null]));
    });
    t.hidden = false;
    var w = t.offsetWidth, hh = t.offsetHeight;
    var left = Math.min(Math.max(8, x + 14), innerWidth - w - 8), top = y - hh - 12;
    if (top < 8) top = y + 18;
    t.style.left = left + scrollX + "px"; t.style.top = top + scrollY + "px";
  }
  function sembunyiTip() { if (TIP) TIP.hidden = true; }
  /* Tooltip hanya mengikuti gerakan kursor yang nyata; halaman yang bergulir di bawah kursor diam tidak memicunya. */
  var gerakTerakhir = 0;
  var posX = -1, posY = -1;
  document.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch" || Math.abs(e.clientX - posX) + Math.abs(e.clientY - posY) > 2) gerakTerakhir = Date.now();
    posX = e.clientX; posY = e.clientY;
  }, true);
  document.addEventListener("keydown", function () { gerakTerakhir = 0; }, true);
  document.addEventListener("focusin", function () { gerakTerakhir = 0; }, true);
  document.addEventListener("pointerdown", function () { gerakTerakhir = Date.now(); }, true);
  var kursorNyata = function () { return Date.now() - gerakTerakhir < 120; };
  function pasangTip(el, isi) {
    var tunjuk = function (e) { if (kursorNyata()) tampilTip(isi(), e.clientX, e.clientY); };
    el.addEventListener("pointermove", tunjuk); el.addEventListener("pointerenter", tunjuk);
    el.addEventListener("pointerleave", sembunyiTip); el.addEventListener("blur", sembunyiTip);
    el.addEventListener("focus", function () { var r = el.getBoundingClientRect(); tampilTip(isi(), r.left + r.width / 2, r.top); });
  }

  /* Batang horizontal berperingkat: perolehan per karya / per pasangan. */
  function grafikPerolehan(rows, surat) {
    var total = rows.reduce(function (a, r) { return a + r.jumlah; }, 0);
    var urut = rows.map(function (r, i) { return { r: r, i: i }; }).sort(function (a, b) { return b.r.jumlah - a.r.jumlah || a.i - b.i; }).map(function (x) { return x.r; });
    var max = urut.length ? urut[0].jumlah : 0;
    var unggul = urut.filter(function (r) { return max > 0 && r.jumlah === max; }).length;
    if (!urut.length) return h("p", { class: "muted", text: "Belum ada pilihan yang tayang." });
    return h("ol", { class: "rk-bars", "aria-label": "Perolehan suara " + NAMA_S[surat] }, urut.map(function (r) {
      var p = pct(r.jumlah, total), lebar = max ? r.jumlah / max * 100 : 0;
      var chip = max > 0 && r.jumlah === max ? h("span", { class: "rk-chip", text: unggul > 1 ? "Seri" : "Unggul" }) : null;
      var li = h("li", { class: "rk-row", tabindex: "0", "aria-label": r.label + (r.sub ? " (" + r.sub + ")" : "") + ": " + r.jumlah + " suara, " + fmtPct(p) }, [
        h("div", { class: "rk-lbl" }, [h("b", { text: r.label }), r.sub ? h("small", { text: r.sub }) : null, r.tayang === false ? h("small", { text: "disembunyikan" }) : null, chip]),
        h("div", { class: "rk-track" }, h("i", { class: "rk-bar", style: "width:" + lebar + "%;background:" + WARNA_S[surat] })),
        h("span", { class: "rk-val" }, [h("b", { text: String(r.jumlah) }), h("span", { text: fmtPct(p) })])
      ]);
      pasangTip(li, function () {
        var beda = max - r.jumlah;
        return [{ warna: WARNA_S[surat], nilai: r.jumlah + " suara", ket: r.label },
          { nilai: fmtPct(p), ket: "dari " + total + " suara masuk" + (beda > 0 ? " · tertinggal " + beda : "") }];
      });
      return li;
    }));
  }

  /* Partisipasi per kelas: dua batang tipis per kelas, skala = % dari pemilih terdaftar. */
  function grafikKelas(list) {
    return h("div", null, [
      legenda(["sayembara", "ketua"], "rect"),
      h("ul", { class: "rk-kelas", "aria-label": "Partisipasi per kelas" }, list.map(function (k) {
        return h("li", { class: "rk-k" }, [
          h("div", { class: "rk-lbl" }, [h("b", { text: k.label }), h("small", { text: k.terdaftar + " pemilih" })]),
          h("div", { class: "rk-k-bars" }, ["sayembara", "ketua"].map(function (s) {
            var p = pct(k[s], k.terdaftar);
            var row = h("div", { class: "rk-k-row", tabindex: "0", "aria-label": k.label + ", " + NAMA_S[s] + ": " + k[s] + " dari " + k.terdaftar + " (" + fmtPct(p) + ")" }, [
              h("div", { class: "rk-track thin" }, h("i", { class: "rk-bar", style: "width:" + Math.min(100, p) + "%;background:" + WARNA_S[s] })),
              h("span", { class: "rk-val" }, [h("b", { text: fmtPct(p) }), h("span", { text: k[s] + "/" + k.terdaftar })])
            ]);
            pasangTip(row, function () { return [{ warna: WARNA_S[s], nilai: fmtPct(p), ket: NAMA_S[s] + " · " + k.label }, { nilai: k[s] + " dari " + k.terdaftar, ket: "pemilih sudah memilih" }]; });
            return row;
          }))
        ]);
      }))
    ]);
  }

  function legenda(seri, bentuk) {
    return h("div", { class: "rk-legend" }, seri.map(function (s) {
      return h("span", null, [h("i", { class: "rk-key" + (bentuk === "line" ? " line" : ""), style: "background:" + WARNA_S[s] }), NAMA_S[s]]);
    }));
  }

  /* Suara masuk dari waktu ke waktu: garis kumulatif per jam, crosshair + tooltip. */
  function grafikWaktu(box, d) {
    clear(box);
    var JAM = 3600000, mulai = Math.floor(new Date(d.buka).getTime() / JAM) * JAM;
    var akhir = Math.min(new Date(d.sekarang).getTime(), new Date(d.tutup).getTime());
    if (akhir <= mulai) { box.appendChild(h("p", { class: "muted", text: "Voting belum dibuka. Grafik muncul setelah suara pertama masuk." })); return; }
    var n = Math.floor((akhir - mulai) / JAM) + 1, idx = {};
    (d.per_jam || []).forEach(function (r) { idx[Math.floor(new Date(r.jam).getTime() / JAM) * JAM] = r; });
    var titik = [], cs = 0, ck = 0;
    for (var i = 0; i < n; i++) {
      var t = mulai + i * JAM, r = idx[t];
      cs += r ? r.sayembara : 0; ck += r ? r.ketua : 0;
      titik.push({ t: t, sayembara: cs, ketua: ck, ms: r ? r.sayembara : 0, mk: r ? r.ketua : 0 });
    }
    var W = Math.max(280, box.clientWidth || 600), H = 230, ml = 40, mr = 44, mt = 14, mb = 28;
    var pw = W - ml - mr, ph = H - mt - mb;
    var ymax = Math.max(4, cs, ck), langkah = Math.pow(10, Math.floor(Math.log10(ymax / 4)));
    [1, 2, 5, 10].some(function (m) { if (ymax / (langkah * m) <= 4) { langkah *= m; return true; } return false; });
    ymax = Math.ceil(ymax / langkah) * langkah;
    var X = function (i) { return ml + (n === 1 ? pw / 2 : i / (n - 1) * pw); }, Y = function (v) { return mt + ph - v / ymax * ph; };
    var svg = sv2("svg", { class: "rk-svg", width: W, height: H, viewBox: "0 0 " + W + " " + H, role: "img", "aria-label": "Suara masuk kumulatif per jam. Sayembara " + cs + ", ketua " + ck + ".", tabindex: "0" });
    for (var v = 0; v <= ymax; v += langkah) {
      svg.appendChild(sv2("line", { class: "rk-grid", x1: ml, x2: W - mr, y1: Y(v), y2: Y(v) }));
      svg.appendChild(sv2("text", { class: "rk-ax", x: ml - 8, y: Y(v) + 4, "text-anchor": "end" }, String(v)));
    }
    // penanda hari (00.00 WIB); label dijarangkan bila sempit
    var hari = titik.filter(function (p) { return (p.t + 7 * JAM) % (24 * JAM) === 0; });
    var tiap = Math.max(1, Math.ceil(hari.length * 56 / pw));
    hari.forEach(function (p, k) {
      var x = X((p.t - mulai) / JAM);
      svg.appendChild(sv2("line", { class: "rk-tick", x1: x, x2: x, y1: mt + ph, y2: mt + ph + 5 }));
      if (k % tiap === 0) svg.appendChild(sv2("text", { class: "rk-ax", x: x, y: H - 8, "text-anchor": "middle" }, fmtHariW.format(new Date(p.t))));
    });
    svg.appendChild(sv2("line", { class: "rk-base", x1: ml, x2: W - mr, y1: mt + ph, y2: mt + ph }));
    ["ketua", "sayembara"].forEach(function (s) {
      var dpath = titik.map(function (p, i) { return (i ? "L" : "M") + X(i).toFixed(1) + "," + Y(p[s]).toFixed(1); }).join("");
      svg.appendChild(sv2("path", { class: "rk-line", d: dpath, stroke: WARNA_S[s] }));
    });
    // label nilai akhir langsung di ujung garis (digeser bila bertumpuk)
    var ya = Y(cs), yb = Y(ck);
    if (Math.abs(ya - yb) < 14) { if (ya <= yb) { ya -= 7; yb += 7; } else { ya += 7; yb -= 7; } }
    svg.appendChild(sv2("text", { class: "rk-end", x: X(n - 1) + 6, y: ya + 4 }, String(cs)));
    svg.appendChild(sv2("text", { class: "rk-end", x: X(n - 1) + 6, y: yb + 4 }, String(ck)));
    // lapisan crosshair
    var hair = sv2("line", { class: "rk-hair", x1: 0, x2: 0, y1: mt, y2: mt + ph, visibility: "hidden" });
    var dot = { sayembara: sv2("circle", { r: 4.5, fill: WARNA_S.sayembara, class: "rk-dot", visibility: "hidden" }), ketua: sv2("circle", { r: 4.5, fill: WARNA_S.ketua, class: "rk-dot", visibility: "hidden" }) };
    svg.appendChild(hair); svg.appendChild(dot.ketua); svg.appendChild(dot.sayembara);
    var hit = sv2("rect", { x: ml, y: mt, width: pw, height: ph, fill: "transparent" });
    svg.appendChild(hit);
    var aktif = n - 1;
    function tunjuk(i, cx, cy) {
      aktif = Math.max(0, Math.min(n - 1, i));
      var p = titik[aktif], x = X(aktif);
      hair.setAttribute("x1", x); hair.setAttribute("x2", x); hair.setAttribute("visibility", "visible");
      ["sayembara", "ketua"].forEach(function (s) { dot[s].setAttribute("cx", x); dot[s].setAttribute("cy", Y(p[s])); dot[s].setAttribute("visibility", "visible"); });
      var r = svg.getBoundingClientRect();
      tampilTip([{ nilai: fmtJamW.format(new Date(p.t)) + " WIB" },
        { warna: WARNA_S.sayembara, nilai: String(p.sayembara), ket: "Sayembara" + (p.ms ? " (+" + p.ms + " jam ini)" : "") },
        { warna: WARNA_S.ketua, nilai: String(p.ketua), ket: "Ketua & Wakil" + (p.mk ? " (+" + p.mk + " jam ini)" : "") }],
        cx != null ? cx : r.left + x, cy != null ? cy : r.top + mt);
    }
    function lepas() { hair.setAttribute("visibility", "hidden"); dot.sayembara.setAttribute("visibility", "hidden"); dot.ketua.setAttribute("visibility", "hidden"); sembunyiTip(); }
    svg.addEventListener("pointermove", function (e) {
      if (!kursorNyata()) return;
      var r = svg.getBoundingClientRect(), x = (e.clientX - r.left) * (W / r.width);
      tunjuk(Math.round(n === 1 ? 0 : (x - ml) / pw * (n - 1)), e.clientX, e.clientY);
    });
    svg.addEventListener("pointerleave", lepas);
    svg.addEventListener("focus", function () { tunjuk(aktif); });
    svg.addEventListener("blur", lepas);
    svg.addEventListener("keydown", function (e) {
      var k = { ArrowLeft: -1, ArrowRight: 1, Home: -1e9, End: 1e9 }[e.key];
      if (k == null) return; e.preventDefault(); tunjuk(aktif + k);
    });
    box.appendChild(svg);
  }

  function tabelHarian(d) {
    var per = {};
    (d.per_jam || []).forEach(function (r) {
      var k = sv.format(new Date(r.jam)).slice(0, 10);
      per[k] = per[k] || { t: r.jam, s: 0, k: 0 }; per[k].s += r.sayembara; per[k].k += r.ketua;
    });
    var cs = 0, ck = 0;
    var baris = Object.keys(per).sort().map(function (k) { var x = per[k]; cs += x.s; ck += x.k; return [fmtTglW.format(new Date(x.t)), x.s, x.k, cs, ck]; });
    return tabel([{ t: "Hari" }, { t: "Sayembara masuk", num: true }, { t: "Ketua masuk", num: true }, { t: "Total sayembara", num: true }, { t: "Total ketua", num: true }], baris, { kosong: "Belum ada suara masuk." });
  }

  function vAuditor(masihAktif) {
    clear(panel);
    panel.appendChild(h("h1", { class: "h2", text: "Auditor" }));
    var dash = h("section", { class: "rk", "aria-labelledby": "rk-h" });
    panel.appendChild(dash);

    var data = null, wadahWaktu = null;
    function gambar(d) {
      sembunyiTip();
      data = d; clear(dash);
      var faseTxt = { sebelum: "Belum dibuka", buka: "Voting dibuka", tutup: "Voting ditutup", dijeda: "Dijeda" }[d.fase] || d.fase;
      dash.appendChild(h("div", { class: "rk-head" }, [
        h("h2", { id: "rk-h", class: "rk-title", text: "Rekap langsung" }),
        h("span", { class: "pill " + (d.fase === "buka" ? "on" : ""), text: faseTxt }),
        h("span", { class: "mono muted rk-upd", id: "rk-upd", text: "Diperbarui " + fmtDetik.format(new Date(d.sekarang)) + " WIB · otomatis tiap 30 detik" }),
        h("button", { type: "button", class: "btn alt btn-s", id: "rk-refresh", text: "Perbarui", onclick: function () { muat(); } })
      ]));
      dash.appendChild(h("p", { class: "adm-note warn-n", text: "Rahasia sampai hasil dibuka untuk publik (" + fmtW(d.hasil_at) + " WIB). Jangan dibagikan atau ditampilkan ke peserta." }));
      var tile = function (angka, label, sub, id) { return h("div", { class: "stat", id: id }, [h("b", { text: angka }), h("span", { text: label }), sub ? h("small", { class: "rk-sub", text: sub }) : null]); };
      var jamIni = (d.per_jam || []).filter(function (r) { return new Date(d.sekarang) - new Date(r.jam) < 3600000; }).reduce(function (a, r) { return a + r.sayembara + r.ketua; }, 0);
      dash.appendChild(h("div", { class: "adm-grid rk-tiles" }, [
        tile(String(d.memilih_salah_satu), "Sudah memilih", fmtPct(pct(d.memilih_salah_satu, d.total_pemilih)) + " dari " + d.total_pemilih + " pemilih", "rk-t-semua"),
        tile(String(d.memilih_sayembara), "Suara sayembara", fmtPct(pct(d.memilih_sayembara, d.total_pemilih)) + " partisipasi", "rk-t-s"),
        tile(String(d.memilih_ketua), "Suara ketua", fmtPct(pct(d.memilih_ketua, d.total_pemilih)) + " partisipasi", "rk-t-k"),
        tile(String(jamIni), "Masuk 1 jam terakhir", "dua surat suara digabung", "rk-t-jam")
      ]));
      dash.appendChild(h("div", { class: "rk-pair" }, [
        h("article", { class: "rk-card", id: "rk-sayembara" }, [h("h3", null, [h("i", { class: "rk-key", style: "background:" + WARNA_S.sayembara }), "Sayembara identitas"]),
          h("p", { class: "muted rk-cap", text: d.memilih_sayembara + " suara masuk. Panjang batang relatif terhadap yang unggul." }), grafikPerolehan(d.sayembara, "sayembara")]),
        h("article", { class: "rk-card", id: "rk-ketua" }, [h("h3", null, [h("i", { class: "rk-key", style: "background:" + WARNA_S.ketua }), "Ketua & Wakil"]),
          h("p", { class: "muted rk-cap", text: d.memilih_ketua + " suara masuk. Panjang batang relatif terhadap yang unggul." }), grafikPerolehan(d.ketua, "ketua")])
      ]));
      wadahWaktu = h("div", { class: "rk-time" });
      dash.appendChild(h("article", { class: "rk-card", id: "rk-waktu" }, [h("h3", { text: "Suara masuk dari waktu ke waktu" }),
        h("p", { class: "muted rk-cap", text: "Jumlah kumulatif per jam sejak voting dibuka. Arahkan kursor atau gunakan panah kiri/kanan untuk melihat angka tiap jam." }),
        legenda(["sayembara", "ketua"], "line"), wadahWaktu,
        h("details", { class: "rk-det" }, [h("summary", { text: "Lihat data per hari" }), tabelHarian(d)])]));
      grafikWaktu(wadahWaktu, d);
      dash.appendChild(h("article", { class: "rk-card", id: "rk-kelas" }, [h("h3", { text: "Partisipasi per kelas" }),
        h("p", { class: "muted rk-cap", text: "Persentase pemilih terdaftar di tiap kelas yang sudah memberi suara." }), grafikKelas(d.per_kelas)]));
    }
    function muat() {
      dash.classList.add("rk-loading");
      return rpc("auditor_rekap").then(function (x) {
        if (!masihAktif()) return;
        dash.classList.remove("rk-loading");
        if (x.error) {
          if (!data) { clear(dash); dash.appendChild(h("p", { class: "form-err", text: /auditor_rekap/.test(x.error.message || "") && /find|exist|schema/i.test(x.error.message || "") ? "Fungsi rekap belum ada di database. Jalankan ulang supabase/schema.sql di SQL Editor." : galat(x.error) })); }
          else if ($("rk-upd")) $("rk-upd").textContent = "Gagal memperbarui: " + galat(x.error);
          return;
        }
        gambar(x.data);
      });
    }
    var lebar = innerWidth;
    var onResize = function () { if (!masihAktif()) { removeEventListener("resize", onResize); return; } if (data && wadahWaktu && Math.abs(innerWidth - lebar) > 20) { lebar = innerWidth; grafikWaktu(wadahWaktu, data); } };
    addEventListener("resize", onResize);
    // Pembaruan otomatis ditunda selama grafik sedang disorot/difokus agar tooltip tidak hilang di tengah jalan.
    timer = setInterval(function () {
      if (document.hidden || !masihAktif()) return;
      if (dash.contains(document.activeElement) || dash.matches(":hover")) return;
      muat();
    }, 30000);

    panel.appendChild(h("h2", { class: "rk-title rk-sep", text: "Daftar suara per NIM" }));
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
    return muat();
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
