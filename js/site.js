/* NARASI 2026 · situs publik (multi halaman: Home, About, Voting, Kontak)
   Satu berkas untuk semua halaman; tiap modul hanya berjalan bila elemennya ada.
   Konten statis (timeline) ada di blok CONTENT. Data karya, calon, dokumentasi,
   jadwal voting, dan hasil selalu diambil dari server (Supabase). */
(function () {
  "use strict";

  /* ===================== Konten statis ===================== */
  var CONTENT = {
    instagram: "narasi2026.id",
    event: "2026-11-13T13:00:00+07:00",
    eventDate: "2026-11-13",
    start: "2026-10-12T00:00:00+07:00",
    timeline: [
      { from: "2026-10-12", to: "2026-10-16", title: "Pendaftaran", detail: "Peserta sayembara identitas dan pasangan calon Ketua dan Wakil." },
      { from: "2026-10-19", to: "2026-10-23", title: "Pengumpulan karya dan visi misi", detail: "Paket identitas dan penyampaian visi misi pasangan calon." },
      { from: "2026-10-26", to: "2026-10-26", title: "Publikasi", detail: "Karya sayembara dan pasangan calon tayang di Instagram dan di halaman Voting." },
      { from: "2026-10-26", to: "2026-10-30", title: "Kampanye dan voting", detail: "Seluruh mahasiswa Bisnis Digital 2026 memberikan suara." },
      { from: "2026-11-02", to: "2026-11-06", title: "Rekapitulasi dan verifikasi", detail: "Panitia memeriksa data dan menyiapkan puncak acara." },
      { from: "2026-11-09", to: "2026-11-12", title: "Finalisasi persiapan", detail: "Seminar, perlengkapan, dan koordinasi hari-H." },
      { from: "2026-11-13", to: "2026-11-13", title: "Puncak acara NARASI", detail: "Mini seminar, games, pengumuman Ketua dan Wakil, serta pemenang sayembara." }
    ]
  };

  /* ===================== Util ===================== */
  var MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var T = function (s) { return new Date(s).getTime(); };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || "") ? u : ""; };
  var PAGE = document.body.getAttribute("data-page") || "";
  /* Tautan lama situs satu halaman (mis. situs/#voting di bio Instagram) dialihkan ke halaman barunya. */
  if (PAGE === "home") {
    var LAMA = { "#voting": "voting.html#voting", "#galeri": "voting.html#galeri", "#hasil": "voting.html#hasil", "#ketua": "about.html#k-ketua",
      "#sayembara": "about.html#k-sayembara", "#timeline": "about.html#timeline", "#seminar": "about.html#seminar" };
    if (LAMA[location.hash]) { location.replace(LAMA[location.hash]); return; }
    window.addEventListener("hashchange", function () { if (LAMA[location.hash]) location.replace(LAMA[location.hash]); });
  }
  var REDUCE = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  var TOUCH = window.matchMedia && matchMedia("(hover: none)").matches;
  document.documentElement.classList.add(TOUCH ? "touch" : "mouse");
  /* Foto: yang disimpan di database hanya path di bucket "narasi"; URL disusun di sini. */
  var fotoUrl = function (path) {
    var base = (window.NARASI_CONFIG || {}).SUPABASE_URL || "";
    base = String(base).trim().replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
    return base && /^[a-z0-9_-]+\/[a-z0-9-]+\.(jpg|jpeg|png|webp)$/.test(path || "") ? base + "/storage/v1/object/public/narasi/" + path : "";
  };
  /* ID video YouTube dari berbagai bentuk tautan; null bila bukan YouTube. */
  var ytId = function (u) {
    var m = String(u || "").match(/^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:[^#]*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})(?![A-Za-z0-9_-])/i);
    return m ? m[1] : null;
  };

  // Pembuat elemen: semua teks lewat textContent, tidak pernah innerHTML.
  function h(tag, props, kids) {
    var e = document.createElement(tag);
    if (props) Object.keys(props).forEach(function (k) {
      var v = props[k];
      if (v == null || v === false) return;
      if (k === "class") e.className = v;
      else if (k === "text") e.textContent = v;
      else if (k.slice(0, 2) === "on") e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? "" : v);
    });
    [].concat(kids == null ? [] : kids).forEach(function (c) {
      if (c == null || c === false) return;
      e.appendChild(typeof c === "string" || typeof c === "number" ? document.createTextNode(String(c)) : c);
    });
    return e;
  }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; }
    return a;
  }
  var fmtFull = new Intl.DateTimeFormat("id-ID", { dateStyle: "full", timeStyle: "short", timeZone: "Asia/Jakarta" });
  var fmtShort = new Intl.DateTimeFormat("id-ID", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Jakarta" });
  var fmtYmd = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  function fmtWaktu(iso) { return fmtFull.format(new Date(iso)) + " WIB"; }
  function fmtPendek(iso) { return fmtShort.format(new Date(iso)).replace(/\./g, ".") + " WIB"; }
  function sisa(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), j = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d > 0) return d + " hari " + j + " jam lagi";
    if (j > 0) return j + " jam " + m + " menit lagi";
    return m + " menit " + (s % 60) + " detik lagi";
  }
  function buzz() { try { if (navigator.vibrate) navigator.vibrate(12); } catch (e) {} }

  /* ===================== Backend (Home dan Voting saja) ===================== */
  var CFG = window.NARASI_CONFIG || {};
  if (CFG.SUPABASE_URL) CFG.SUPABASE_URL = String(CFG.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
  var sb = null;
  try {
    if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } else if (PAGE === "home" || PAGE === "voting") {
      console.warn("NARASI: js/config.js belum diisi. Bilik suara dan galeri dinonaktifkan.");
    }
  } catch (e) { console.error(e); }

  function rpc(name, args) {
    if (!sb) return Promise.resolve({ error: { message: "backend-belum-diatur" } });
    return Promise.resolve(sb.rpc(name, args || {})).then(function (r) { return r; }, function (e) { return { error: e || { message: "jaringan" } }; });
  }

  var S = { status: null, offset: 0, error: false, hasilDimuat: false, lastLoad: 0, galeriKey: "", dokKey: "" };
  var nowMs = function () { return Date.now() + S.offset; };

  /* ===================== Semua halaman: tautan Instagram ===================== */
  qa(".ig-link").forEach(function (a) { a.href = "https://www.instagram.com/" + CONTENT.instagram + "/"; });
  qa(".ig-text").forEach(function (e) { e.textContent = "@" + CONTENT.instagram; });

  /* ===================== Lightbox foto (galeri: geser, panah, Escape) ===================== */
  var lb = null, lastBtn = null, LB = { items: [], i: 0 };
  function closeLb() {
    if (!lb) return;
    lb.remove(); lb = null; document.removeEventListener("keydown", onKey);
    document.documentElement.classList.remove("lb-open");
    if (lastBtn && document.contains(lastBtn)) lastBtn.focus();
  }
  function onKey(e) {
    if (e.key === "Escape") closeLb();
    else if (e.key === "ArrowRight") geserLb(1);
    else if (e.key === "ArrowLeft") geserLb(-1);
  }
  function tampilLb() {
    var it = LB.items[LB.i], img = lb.querySelector(".lb-img"), cap = lb.querySelector("figcaption"), n = lb.querySelector(".lb-n");
    img.src = it.src; img.alt = it.alt || "";
    cap.textContent = it.cap || "";
    if (n) n.textContent = (LB.i + 1) + " / " + LB.items.length;
  }
  function geserLb(d) {
    if (!lb || LB.items.length < 2) return;
    LB.i = (LB.i + d + LB.items.length) % LB.items.length;
    tampilLb(); buzz();
    lb.dispatchEvent(new CustomEvent("lb:geser", { detail: d }));
  }
  /* items: [{src, alt, cap}] */
  function bukaLb(items, i, btn) {
    closeLb(); lastBtn = btn; LB = { items: items, i: i || 0 };
    var banyak = items.length > 1;
    var x = h("button", { type: "button", class: "x", text: "Tutup ×", onclick: closeLb });
    var fig = h("figure", null, [h("img", { class: "lb-img", src: "", alt: "" }), h("figcaption", { class: "mono" })]);
    lb = h("div", { class: "lb", role: "dialog", "aria-modal": "true", "aria-label": "Foto" }, [
      x, fig,
      banyak ? h("button", { type: "button", class: "lb-nav lb-prev", "aria-label": "Foto sebelumnya", text: "<", onclick: function (e) { e.stopPropagation(); geserLb(-1); } }) : null,
      banyak ? h("button", { type: "button", class: "lb-nav lb-next", "aria-label": "Foto berikutnya", text: ">", onclick: function (e) { e.stopPropagation(); geserLb(1); } }) : null,
      banyak ? h("span", { class: "lb-n mono", "aria-live": "polite" }) : null
    ]);
    lb.addEventListener("click", function (e) { if (e.target === lb || e.target === fig) closeLb(); });
    var x0 = null, y0 = null;
    lb.addEventListener("touchstart", function (e) { var t = e.changedTouches[0]; x0 = t.clientX; y0 = t.clientY; }, { passive: true });
    lb.addEventListener("touchend", function (e) {
      if (x0 == null) return;
      var t = e.changedTouches[0], dx = t.clientX - x0, dy = t.clientY - y0; x0 = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) geserLb(dx < 0 ? 1 : -1);
      else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) closeLb();
    });
    tampilLb();
    document.body.appendChild(lb); document.documentElement.classList.add("lb-open");
    x.focus(); document.addEventListener("keydown", onKey);
  }

  /* ===================== Voting: galeri (dari server) ===================== */
  /* ===================== Galeri (dari server) ===================== */
  function nosignal(title, text) {
    return h("div", { class: "nosig" }, [h("b", null, [title, h("span", { class: "cur", "aria-hidden": "true" })]), h("p", { text: text })]);
  }
  function linkBtn(u, label) {
    u = safeUrl(u);
    return u ? h("p", { style: "margin-top:10px" }, [h("a", { class: "btn alt", href: u, target: "_blank", rel: "noopener noreferrer", text: label })]) : null;
  }
  function renderGaleri() {
    var st = S.status, ent = $("entries"), can = $("candidates");
    if (!ent || !can) return;
    var key = st ? JSON.stringify([st.karya, st.calon]) : "x" + (S.error ? "e" : "");
    if (key === S.galeriKey) return;
    S.galeriKey = key;
    clear(ent); clear(can);
    if (!st) {
      var pesan = sb && !S.error ? "Memuat galeri." : "Galeri belum tersedia.";
      ent.appendChild(nosignal("Belum ada sinyal", pesan));
      can.appendChild(nosignal("Belum ada sinyal", pesan));
      return;
    }
    if (st.karya.length) {
      ent.appendChild(h("div", { class: "cards" }, st.karya.map(function (k) {
        return h("article", { class: "cell" }, [
          h("span", { class: "k mono", text: k.kelompok }), h("h3", { text: k.nama }),
          fotoStrip(k.foto, k.nama),
          k.slogan ? h("p", { text: "“" + k.slogan + "”" }) : null,
          k.filosofi ? h("p", { class: "muted", style: "margin-top:6px", text: k.filosofi }) : null,
          videoBlok(k.tautan_video, "Tonton video"), linkBtn(k.tautan_paket, "Lihat paket karya")
        ]);
      })));
    } else {
      ent.appendChild(nosignal("Belum ada sinyal", "Paket nama, logo, slogan, bendera, dan video muncul di sini saat dipublikasikan."));
    }
    if (st.calon.length) {
      can.appendChild(h("div", { class: "cards cards-calon" }, st.calon.map(function (c) {
        return h("article", { class: "cell" }, [
          h("span", { class: "k mono", text: "Pasangan calon" }),
          pasangan(c, false),
          h("h3", { text: c.ketua + " & " + c.wakil }),
          c.visi ? h("p", { text: c.visi }) : null, videoBlok(c.tautan_kampanye, "Lihat kampanye")
        ]);
      })));
    } else {
      can.appendChild(nosignal("Menunggu pendaftar", "Pasangan calon diumumkan bersamaan dengan publikasi karya."));
    }
  }

  /* Deret foto karya; klik membuka lightbox. */
  function fotoStrip(list, alt) {
    var urls = (list || []).map(fotoUrl).filter(Boolean);
    if (!urls.length) return null;
    var items = urls.map(function (u, i) { return { src: u, alt: alt + ", foto " + (i + 1), cap: alt + " · foto " + (i + 1) + " dari " + urls.length }; });
    return h("div", { class: "fstrip" }, urls.map(function (u, i) {
      var img = h("img", { src: u, alt: alt + ", foto " + (i + 1), loading: "lazy", decoding: "async" });
      var b = h("button", { type: "button", class: "fthumb", "aria-label": "Perbesar foto " + (i + 1) + " " + alt, onclick: function () { bukaLb(items, i, b); } }, img);
      return b;
    }));
  }
  /* Pasangan calon: dua potret 4:5. kecil = versi ringkas untuk surat suara. */
  function pasangan(c, kecil) {
    var ku = fotoUrl(c.foto_ketua), wu = fotoUrl(c.foto_wakil);
    if (!ku && !wu) return null;
    function pot(u, peran, nama) {
      var box = h("figure", { class: "pot" });
      if (u) {
        var img = h("img", { src: u, alt: peran + ": " + nama, loading: "lazy", decoding: "async" });
        if (kecil) box.appendChild(img);
        else { var b = h("button", { type: "button", "aria-label": "Perbesar foto " + peran + " " + nama, onclick: function () { bukaLb([{ src: u, alt: peran + ": " + nama, cap: peran + " · " + nama }], 0, b); } }, img); box.appendChild(b); }
      } else box.appendChild(h("div", { class: "pot-kosong", text: "Foto menyusul" }));
      box.appendChild(h("figcaption", { class: "mono" }, [h("b", { text: peran }), " " + nama]));
      return box;
    }
    return h("div", { class: "pair" + (kecil ? " pair-s" : "") }, [pot(ku, "Ketua", c.ketua), pot(wu, "Wakil", c.wakil)]);
  }
  /* Video: YouTube diputar di halaman (iframe dibuat saat diklik); lainnya jadi tautan. */
  function videoBlok(u, label) {
    var id = ytId(u);
    if (!id) return linkBtn(u, label);
    var box = h("div", { class: "yt" });
    var play = h("button", { type: "button", class: "yt-play", "aria-label": "Putar video" }, [
      h("img", { src: "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg", alt: "", loading: "lazy" }),
      h("span", { class: "yt-btn", text: "▶ Putar" })]);
    play.addEventListener("click", function () {
      clear(box);
      box.appendChild(h("iframe", { src: "https://www.youtube-nocookie.com/embed/" + id + "?autoplay=1&rel=0", title: "Video", allow: "autoplay; encrypted-media; picture-in-picture; fullscreen", allowfullscreen: true, referrerpolicy: "strict-origin-when-cross-origin" }));
    });
    box.appendChild(play);
    return h("div", { class: "yt-wrap" }, [box, linkBtn(u, "Buka di YouTube")]);
  }

  /* ===================== Bilik suara ===================== */
  var ERR = {
    tidak_cocok: "NIM dan kelas tidak cocok dengan daftar pemilih. Periksa penulisan NIM dan pilihan kelas, atau hubungi panitia.",
    terlalu_banyak: "Terlalu banyak percobaan yang gagal. Tunggu sekitar 15 menit lalu coba lagi, atau hubungi panitia.",
    belum_dibuka: "Bilik suara belum dibuka.",
    sudah_ditutup: "Voting sudah ditutup.",
    dijeda: "Voting sedang dijeda oleh panitia. Coba lagi nanti.",
    pilihan_tidak_valid: "Salah satu pilihan tidak lagi tersedia. Muat ulang halaman lalu pilih lagi.",
    kosong: "Pilih minimal satu surat suara.",
    jaringan: "Tidak bisa terhubung ke server. Periksa koneksi lalu coba lagi."
  };
  function errText(r) {
    var code = r && r.data && r.data.error;
    if (code && ERR[code]) return ERR[code];
    return ERR.jaringan;
  }

  var V = { step: "identitas", nim: "", kelas: "", kelasLabel: "", sudah: {}, pilih: { karya: null, calon: null }, urut: null, busy: false };
  function resetVote() { V = { step: "identitas", nim: "", kelas: "", kelasLabel: "", sudah: {}, pilih: { karya: null, calon: null }, urut: null, busy: false }; }
  var inBallot = function () { return V.step === "surat" || V.step === "konfirmasi"; };
  function find(list, id) { for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i]; return null; }

  function renderVote() {
    var root = $("vote-body"), st = S.status;
    if (!root) return;
    if (inBallot() && st && st.fase === "buka") return;
    if (V.step === "selesai") return;
    clear(root);
    root.appendChild(h("h2", { id: "h-voting", text: "Bilik Suara" }));
    if (!sb) { root.appendChild(h("p", { text: "Bilik suara belum tersedia." })); return; }
    if (!st) { root.appendChild(h("p", { text: S.error ? ERR.jaringan : "Memuat bilik suara." })); return; }

    var hasilTxt = "Hasil dibuka otomatis pada " + fmtWaktu(st.hasil_at) + ".";
    if (st.fase === "sebelum") {
      root.appendChild(h("div", { class: "vote-state" }, [h("span", { class: "chip", text: "Terkunci" }),
        h("span", { class: "mono muted" }, ["Dibuka " + fmtWaktu(st.buka) + " · ", h("span", { id: "vote-cd" })])]));
      root.appendChild(h("p", { text: "Bilik suara belum dibuka. Pelajari karya dan calon di galeri dulu, lalu kembali saat voting mulai." }));
      root.appendChild(aturan(st));
    } else if (st.fase === "dijeda") {
      root.appendChild(h("div", { class: "vote-state" }, [h("span", { class: "chip", text: "Dijeda" })]));
      root.appendChild(h("p", { text: ERR.dijeda }));
    } else if (st.fase === "tutup") {
      root.appendChild(h("div", { class: "vote-state" }, [h("span", { class: "chip", text: "Ditutup" })]));
      root.appendChild(h("p", { text: "Voting sudah berakhir. Panitia sedang memeriksa dan merekap suara. " + hasilTxt }));
    } else {
      root.appendChild(h("div", { class: "vote-state" }, [
        h("span", { class: "chip chip-on", text: "Dibuka" }),
        h("span", { class: "mono muted" }, ["Ditutup " + fmtWaktu(st.tutup) + " · ", h("span", { id: "vote-cd" })])]));
      root.appendChild(aturan(st));
      root.appendChild(identitasForm(st));
    }
  }

  function aturan(st) {
    return h("ol", { class: "vote-steps" }, [
      h("li", null, [h("strong", { text: "Masukkan NIM" }), " dan pilih kelas Anda. Hanya mahasiswa yang terdaftar yang bisa memilih."]),
      h("li", null, [h("strong", { text: "Dua surat suara:" }), " paket identitas dan pasangan calon Ketua dan Wakil. Boleh memilih salah satunya saja."]),
      h("li", null, [h("strong", { text: "Suara bersifat final" }), " dan tidak bisa diubah setelah dikirim. Satu NIM hanya satu kali memilih. " + "Hasil dibuka otomatis pada " + fmtWaktu(st.hasil_at) + "."])
    ]);
  }

  function field(id, label, control) { return h("div", { class: "field" }, [h("label", { for: id, text: label }), control]); }

  function identitasForm(st) {
    var err = h("p", { class: "form-err", role: "alert", id: "v-err" });
    var nim = h("input", { id: "v-nim", name: "nim", type: "text", autocomplete: "off", autocapitalize: "characters", spellcheck: "false", maxlength: "24", required: true });
    var kelas = h("select", { id: "v-kelas", name: "kelas", required: true }, [h("option", { value: "", text: "Pilih kelas" })].concat(
      st.kelas.map(function (k) { return h("option", { value: k.kode, text: k.label }); })));
    var btn = h("button", { class: "btn", type: "submit", id: "v-lanjut", text: "Lanjut ke surat suara" });
    var form = h("form", { id: "vote-form", novalidate: true, onsubmit: function (ev) {
      ev.preventDefault();
      if (V.busy) return;
      var n = nim.value.trim().toUpperCase(), k = kelas.value;
      if (!/^[A-Z0-9._-]{4,24}$/.test(n)) { err.textContent = "Masukkan NIM dengan benar (4 sampai 24 karakter, huruf dan angka)."; nim.focus(); return; }
      if (!k) { err.textContent = "Pilih kelas Anda."; kelas.focus(); return; }
      err.textContent = ""; V.busy = true; btn.disabled = true; btn.textContent = "Memeriksa...";
      rpc("cek_pemilih", { p_nim: n, p_kelas: k }).then(function (r) {
        V.busy = false; btn.disabled = false; btn.textContent = "Lanjut ke surat suara";
        if (r.error || !r.data) { err.textContent = ERR.jaringan; return; }
        if (!r.data.ok) { err.textContent = errText(r); return; }
        if (r.data.fase !== "buka") { err.textContent = ERR[r.data.fase === "sebelum" ? "belum_dibuka" : "sudah_ditutup"]; return; }
        V.nim = n; V.kelas = k;
        var kl = st.kelas.filter(function (x) { return x.kode === k; })[0];
        V.kelasLabel = kl ? kl.label : k;
        V.sudah = { sayembara: !!r.data.sudah_sayembara, ketua: !!r.data.sudah_ketua };
        V.pilih = { karya: null, calon: null };
        V.urut = { karya: shuffle(st.karya), calon: shuffle(st.calon) };
        V.step = "surat"; renderBallot();
      });
    } }, [
      field("v-nim", "NIM", nim), field("v-kelas", "Kelas", kelas), err, h("p", null, [btn])
    ]);
    return form;
  }

  function opsi(name, item, judul, sub, deskripsi, tautan, visual) {
    var input = h("input", { type: "radio", name: name, value: item.id, onchange: function () { V.pilih[name] = item.id; $("v-err2").textContent = ""; } });
    if (V.pilih[name] === item.id) input.checked = true;
    var links = h("span", { class: "opt-links" }, tautan.map(function (t) {
      var u = safeUrl(t[0]); return u ? h("a", { href: u, target: "_blank", rel: "noopener noreferrer", text: t[1] }) : null;
    }));
    return h("label", { class: "opt" }, [input, h("span", { class: "opt-body" }, [
      visual || null,
      h("b", { text: judul }), sub ? h("span", { class: "mono muted", text: sub }) : null,
      deskripsi ? h("span", { class: "opt-desc", text: deskripsi }) : null, links])]);
  }

  function fieldsetSurat(legend, name, sudah, list, render) {
    var fs = h("fieldset", { class: "surat" }, [h("legend", { text: legend })]);
    if (sudah) { fs.appendChild(h("p", { class: "muted", text: "Anda sudah memberikan suara di surat ini. Suara tidak bisa diubah." })); fs.disabled = true; }
    else if (!list.length) fs.appendChild(h("p", { class: "muted", text: "Belum ada pilihan yang dipublikasikan." }));
    else fs.appendChild(h("div", { class: "opts" }, list.map(render)));
    return fs;
  }

  function renderBallot() {
    var root = $("vote-body"); clear(root);
    root.appendChild(h("h2", { id: "h-voting", text: "Bilik Suara" }));
    root.appendChild(h("div", { class: "vote-state" }, [h("span", { class: "chip chip-on", text: "Dibuka" }),
      h("span", { class: "mono muted", text: "NIM " + V.nim + " · " + V.kelasLabel })]));
    var err = h("p", { class: "form-err", role: "alert", id: "v-err2" });
    var ada = !V.sudah.sayembara && V.urut.karya.length || !V.sudah.ketua && V.urut.calon.length;
    var lanjut = h("button", { class: "btn", type: "button", text: "Periksa pilihan", onclick: function () {
      if (!V.pilih.karya && !V.pilih.calon) { err.textContent = ERR.kosong; return; }
      V.step = "konfirmasi"; renderKonfirmasi();
    } });
    var ganti = h("button", { class: "btn alt", type: "button", text: "Ganti NIM", onclick: function () { resetVote(); renderVote(); } });
    root.appendChild(h("form", { id: "ballot-form", novalidate: true, onsubmit: function (e) { e.preventDefault(); } }, [
      fieldsetSurat("Surat suara 1 · Paket identitas angkatan", "karya", V.sudah.sayembara, V.urut.karya, function (k) {
        return opsi("karya", k, k.nama, k.kelompok, k.slogan ? "“" + k.slogan + "”" : "", [[k.tautan_video, "Tonton video"], [k.tautan_paket, "Lihat paket"]], k.foto && k.foto[0] && fotoUrl(k.foto[0]) ? h("img", { class: "opt-img", src: fotoUrl(k.foto[0]), alt: "", loading: "lazy" }) : null);
      }),
      fieldsetSurat("Surat suara 2 · Ketua dan Wakil Ketua", "calon", V.sudah.ketua, V.urut.calon, function (c) {
        return opsi("calon", c, c.ketua + " & " + c.wakil, "", c.visi || "", [[c.tautan_kampanye, "Lihat kampanye"]], pasangan(c, true));
      }),
      err,
      h("p", { class: "row" }, [ada ? lanjut : null, ganti])
    ]));
    if (!ada) err.textContent = "Anda sudah memberikan suara di semua surat suara yang tersedia.";
    root.querySelector("legend").scrollIntoView({ block: "nearest" });
  }

  function renderKonfirmasi() {
    var st = S.status, root = $("vote-body"); clear(root);
    root.appendChild(h("h2", { id: "h-voting", text: "Periksa Pilihan" }));
    var k = V.pilih.karya && find(st.karya, V.pilih.karya), c = V.pilih.calon && find(st.calon, V.pilih.calon);
    var dl = h("dl", { class: "terms confirm" });
    dl.appendChild(h("dt", { text: "NIM" })); dl.appendChild(h("dd", { text: V.nim + " · " + V.kelasLabel }));
    dl.appendChild(h("dt", { text: "Identitas" })); dl.appendChild(h("dd", { text: k ? k.nama + " (" + k.kelompok + ")" : "Tidak memilih" }));
    dl.appendChild(h("dt", { text: "Ketua" })); dl.appendChild(h("dd", { text: c ? c.ketua + " & " + c.wakil : "Tidak memilih" }));
    root.appendChild(dl);
    root.appendChild(h("p", { class: "warn", text: "Suara bersifat final. Setelah dikirim, pilihan tidak bisa diubah." }));
    var err = h("p", { class: "form-err", role: "alert", id: "v-err3" });
    var kirim = h("button", { class: "btn", type: "button", text: "Kirim suara", onclick: function () {
      if (V.busy) return;
      V.busy = true; kirim.disabled = true; kirim.textContent = "Mengirim...";
      rpc("kirim_suara", { p_nim: V.nim, p_kelas: V.kelas, p_karya: V.pilih.karya, p_calon: V.pilih.calon }).then(function (r) {
        V.busy = false; kirim.disabled = false; kirim.textContent = "Kirim suara";
        if (r.error || !r.data) { err.textContent = ERR.jaringan; return; }
        if (!r.data.ok) { err.textContent = errText(r); return; }
        renderSelesai(r.data);
      });
    } });
    var balik = h("button", { class: "btn alt", type: "button", text: "Kembali", onclick: function () { V.step = "surat"; renderBallot(); } });
    root.appendChild(err);
    root.appendChild(h("p", { class: "row" }, [kirim, balik]));
  }

  var STATUS_TXT = {
    tercatat: "Suara Anda tercatat.",
    sudah_memilih: "Sudah pernah memilih di surat ini, suara sebelumnya tidak diubah.",
    dilewati: "Tidak dipilih."
  };
  function renderSelesai(d) {
    V.step = "selesai";
    var root = $("vote-body"), st = S.status; clear(root);
    root.appendChild(h("h2", { id: "h-voting", text: "Terima Kasih" }));
    root.appendChild(h("div", { class: "vote-state" }, [h("span", { class: "chip chip-on", text: "Selesai" })]));
    var dl = h("dl", { class: "terms confirm" });
    dl.appendChild(h("dt", { text: "Identitas" })); dl.appendChild(h("dd", { text: STATUS_TXT[d.sayembara] || "" }));
    dl.appendChild(h("dt", { text: "Ketua" })); dl.appendChild(h("dd", { text: STATUS_TXT[d.ketua] || "" }));
    root.appendChild(dl);
    root.appendChild(h("p", { text: "Hasil dibuka otomatis pada " + fmtWaktu(st.hasil_at) + ". Tutup halaman ini bila Anda memakai perangkat bersama." }));
    root.appendChild(h("p", null, [h("button", { class: "btn alt", type: "button", text: "Selesai", onclick: function () { resetVote(); renderVote(); } })]));
  }

  /* ===================== Hasil ===================== */
  function renderHasil(d) {
    var sec = $("hasil"), root = $("result-body");
    if (!sec || !root) return;
    sec.hidden = false; if ($("nav-hasil")) $("nav-hasil").hidden = false; clear(root);
    root.appendChild(h("h2", { id: "h-hasil", text: "Hasil Voting" }));
    var pct = function (a, b) { return b ? Math.round(a / b * 100) + "%" : "0%"; };
    root.appendChild(h("p", { class: "mono muted", text: "Partisipasi · identitas " + d.memilih_sayembara + " dari " + d.total_pemilih + " (" + pct(d.memilih_sayembara, d.total_pemilih) + ") · ketua " + d.memilih_ketua + " dari " + d.total_pemilih + " (" + pct(d.memilih_ketua, d.total_pemilih) + ")" }));

    function blok(judul, rows, label) {
      root.appendChild(h("h3", { class: "sub", text: judul }));
      if (!rows.length) { root.appendChild(h("p", { class: "muted", text: "Tidak ada peserta." })); return; }
      var max = Math.max.apply(null, rows.map(function (r) { return r.jumlah; })) || 1;
      root.appendChild(h("ol", { class: "rank" }, rows.map(function (r) {
        var cls = "rank-row" + (r.peringkat === 1 ? " first" : "");
        return h("li", { class: cls }, [
          h("div", { class: "rank-head" }, [
            h("span", { class: "rank-no mono", text: label(r) }),
            h("b", { text: r.label }),
            r.seri ? h("span", { class: "chip", text: "Seri" }) : null,
            h("span", { class: "rank-n mono", text: r.jumlah + " suara" })]),
          r.sub ? h("span", { class: "mono muted", text: r.sub }) : null,
          h("div", { class: "bar", role: "img", "aria-label": r.label + ": " + r.jumlah + " suara" }, [h("i", { style: "width:" + Math.round(r.jumlah / max * 100) + "%" })])
        ]);
      })));
    }
    blok("Sayembara Identitas", d.sayembara, function (r) { return r.peringkat <= 3 ? "Juara " + r.peringkat : "#" + r.peringkat; });
    blok("Ketua dan Wakil Ketua", d.ketua, function (r) { return r.peringkat === 1 && !r.seri ? "Terpilih" : "#" + r.peringkat; });
    if (d.sayembara.concat(d.ketua).some(function (r) { return r.seri; })) {
      root.appendChild(h("p", { class: "note", text: "Peringkat yang bertanda Seri ditetapkan panitia sesuai ketentuan kegiatan." }));
    }
  }
  function muatHasil() {
    if (S.hasilDimuat || !S.status || !S.status.hasil_terbuka || !$("result-body")) return;
    S.hasilDimuat = true;
    rpc("hasil_publik").then(function (r) {
      if (r.error || !r.data || !r.data.terbuka) { S.hasilDimuat = false; return; }
      renderHasil(r.data);
    });
  }

  /* ===================== Status fase: Home (CTA, stiker) dan Voting (ringkas) ===================== */
  var STAMP = {
    sebelum: "VOTING 26 OKT · SIAPKAN PILIHAN · ",
    buka: "VOTING DIBUKA · PILIH SEKARANG · ",
    dijeda: "VOTING DIJEDA · CEK LAGI NANTI · ",
    tutup: "VOTING DITUTUP · HASIL 13 NOV · ",
    hasil: "HASIL SUDAH KELUAR · LIHAT · "
  };
  function faseKini(st) { return st.hasil_terbuka ? "hasil" : st.fase; }
  function renderFase() {
    var st = S.status; if (!st) return;
    var f = faseKini(st), now = nowMs();
    var txt = {
      sebelum: "Voting dibuka " + fmtPendek(st.buka) + " · " + sisa(T(st.buka) - now),
      buka: "Voting sedang dibuka · tutup " + fmtPendek(st.tutup),
      dijeda: "Voting dijeda sementara oleh panitia",
      tutup: "Voting ditutup · hasil " + fmtPendek(st.hasil_at),
      hasil: "Hasil voting sudah keluar"
    }[f] || "";
    var live = $("live");
    if (live) {
      live.hidden = false; live.setAttribute("data-fase", f);
      live.href = f === "hasil" ? "voting.html#hasil" : (f === "buka" ? "voting.html#voting" : "voting.html");
      $("live-txt").textContent = txt;
    }
    var cta = $("cta-vote-txt");
    if (cta) {
      cta.textContent = { sebelum: "Lihat karya & calon", buka: "Pilih sekarang", dijeda: "Ke halaman voting", tutup: "Lihat galeri", hasil: "Lihat hasil" }[f];
      $("cta-vote").href = f === "hasil" ? "voting.html#hasil" : (f === "buka" ? "voting.html#voting" : "voting.html");
    }
    var stamp = $("stamp-txt");
    if (stamp && stamp.getAttribute("data-f") !== f) { stamp.textContent = STAMP[f] || STAMP.sebelum; stamp.setAttribute("data-f", f); $("stamp").href = f === "hasil" ? "voting.html#hasil" : "voting.html"; }
    var vs = $("vstat");
    if (vs) {
      vs.hidden = false; vs.setAttribute("data-fase", f);
      $("vstat-chip").textContent = { sebelum: "Segera", buka: "Dibuka", dijeda: "Dijeda", tutup: "Ditutup", hasil: "Hasil" }[f];
      $("vstat-txt").textContent = txt;
    }
  }

  /* ===================== Home: dokumentasi berjalan ===================== */
  function dokStatik() {
    return qa("#doc-marquee .dcard button").map(function (b) {
      var img = b.querySelector("img");
      return { thumb: img.getAttribute("src"), src: b.getAttribute("data-full"), alt: img.alt, cap: b.getAttribute("data-cap") || "" };
    });
  }
  var DOK0 = $("doc-marquee") ? dokStatik() : [];
  function renderDok() {
    var box = $("doc-marquee"); if (!box) return;
    var dari = S.status && S.status.dokumentasi;
    var items = (dari || []).map(function (d) {
      var u = fotoUrl(d.foto); if (!u) return null;
      return { thumb: u, src: u, alt: d.keterangan ? "Dokumentasi: " + d.keterangan : "Foto dokumentasi angkatan", cap: d.keterangan || "" };
    }).filter(Boolean);
    if (!items.length) items = DOK0;
    var key = JSON.stringify(items.map(function (i) { return i.src + i.cap; }));
    if (key === S.dokKey || !items.length) return;
    S.dokKey = key;
    var rows = items.length >= 6
      ? [items.filter(function (_, i) { return i % 2 === 0; }), items.filter(function (_, i) { return i % 2 === 1; })]
      : [items.slice(), items.slice().reverse()];
    clear(box);
    rows.forEach(function (row, r) {
      var seq = []; while (seq.length < 8) seq = seq.concat(row);
      var track = h("div", { class: "mq-track" });
      var count = 0;
      seq.concat(seq).forEach(function (it, k) {
        var asli = k < row.length;              // salinan pertama saja yang bisa difokus/dibaca
        var idx = items.indexOf(it);
        var no = pad(idx + 1);
        var b = h("button", { type: "button", "aria-label": asli ? "Perbesar foto " + no + (it.cap ? ": " + it.cap : "") : null, tabindex: asli ? null : "-1",
          onclick: function () { bukaLb(items, idx, b); } }, h("img", { src: it.thumb, alt: asli ? it.alt : "", loading: count++ < 6 ? "eager" : "lazy", decoding: "async" }));
        track.appendChild(h("figure", { class: "dcard" + (asli ? "" : " dup"), "aria-hidden": asli ? null : "true", style: "--r:" + ((k * 7 % 5) - 2) * .8 + "deg" }, [
          b, h("figcaption", { class: "mono" }, [h("b", { text: "Arsip " + no }), it.cap ? " " + it.cap : ""])]));
      });
      var rowEl = h("div", { class: "mq-row", "data-dir": r === 0 ? "right" : "left", style: "--dur:" + (seq.length * (TOUCH ? 4.2 : 5)) + "s" }, track);
      // Tahan (sentuh) atau arahkan kursor = berhenti; lepas = jalan lagi.
      rowEl.addEventListener("pointerdown", function () { rowEl.classList.add("hold"); });
      ["pointerup", "pointercancel", "pointerleave"].forEach(function (ev) { rowEl.addEventListener(ev, function () { rowEl.classList.remove("hold"); }); });
      box.appendChild(rowEl);
    });
    box.classList.add("ready");
  }

  /* ===================== Home: portal lorong waktu (ketuk) ===================== */
  (function () {
    var btn = $("portal-btn"), toast = $("portal-toast"); if (!btn) return;
    var ERA = [
      ["2050", "Mendarat di 2050: angkatan ini sudah jadi cerita yang diwariskan."],
      ["1980", "Mundur ke 1980: zaman kaset, disket, dan surat cinta di kertas."],
      ["2000", "Singgah di 2000: era warnet dan SMS 160 karakter."],
      ["2026", "Kembali ke 2026: kamu di sini. Saatnya menulis NARASI."]
    ];
    var i = 0, wrap = btn.parentNode, t = null;
    btn.addEventListener("click", function () {
      var e = ERA[i % ERA.length]; i++;
      wrap.classList.remove("warp"); void wrap.offsetWidth; wrap.classList.add("warp");
      wrap.setAttribute("data-era", e[0]);
      toast.textContent = e[1]; buzz();
      clearTimeout(t); t = setTimeout(function () { wrap.classList.remove("warp"); }, 1300);
    });
  })();

  /* ===================== Home: hitung mundur ===================== */
  var EVENT = T(CONTENT.event), START = T(CONTENT.start);
  function tickHome(now) {
    if (!$("cd-d")) return;
    var s = Math.max(0, Math.floor((EVENT - now) / 1000));
    $("cd-d").textContent = pad(Math.floor(s / 86400));
    $("cd-h").textContent = pad(Math.floor(s % 86400 / 3600));
    $("cd-m").textContent = pad(Math.floor(s % 3600 / 60));
    $("cd-s").textContent = pad(s % 60);
    var pct = Math.max(0, Math.min(100, Math.round((now - START) / (EVENT - START) * 100)));
    $("load-pct").textContent = pct + "%"; $("load-fill").style.width = pct + "%"; $("load-bar").setAttribute("aria-valuenow", pct);
  }

  /* ===================== About: timeline ===================== */
  function rangeText(from, to) {
    var a = from.split("-").map(Number), b = to.split("-").map(Number);
    if (from === to) return a[2] + " " + MON[a[1] - 1] + " " + a[0];
    if (a[1] === b[1]) return a[2] + "–" + b[2] + " " + MON[a[1] - 1] + " " + a[0];
    return a[2] + " " + MON[a[1] - 1] + " – " + b[2] + " " + MON[b[1] - 1] + " " + a[0];
  }
  var LABEL = { selesai: "Selesai", berlangsung: "Berlangsung", berikutnya: "Berikutnya", mendatang: "Mendatang" };
  function renderTimeline() {
    var ol = $("tl-list"); if (!ol) return;
    var now = nowMs(), firstNext = -1;
    CONTENT.timeline.forEach(function (it, i) { if (firstNext < 0 && T(it.from + "T00:00:00+07:00") > now) firstNext = i; });
    var key = CONTENT.timeline.map(function (it, i) {
      var s = T(it.from + "T00:00:00+07:00"), e = T(it.to + "T23:59:59+07:00");
      return now > e ? "selesai" : now >= s ? "berlangsung" : (i === firstNext ? "berikutnya" : "mendatang");
    });
    if (ol.getAttribute("data-k") === key.join()) return;
    ol.setAttribute("data-k", key.join());
    clear(ol);
    CONTENT.timeline.forEach(function (it, i) {
      var st = key[i];
      ol.appendChild(h("li", { class: "tl", "data-state": st }, [
        h("span", { class: "mk", "aria-hidden": "true" }),
        h("div", { class: "card" }, [
          h("div", { class: "when" }, [h("span", { class: "mono", text: rangeText(it.from, it.to) }), h("span", { class: "chip", text: LABEL[st] })]),
          h("h3", { text: it.title }), h("p", { text: it.detail })
        ])
      ]));
    });
  }

  /* ===================== About: rundown, tandai yang sedang berjalan di hari-H ===================== */
  function renderRundown() {
    var ol = $("run-list"); if (!ol) return;
    var p = fmtYmd.format(new Date(nowMs())).split(" "), hari = p[0], jam = p[1];
    var info = $("run-now"), now = null;
    qa("li", ol).forEach(function (li) {
      var s = li.getAttribute("data-s"), e = li.getAttribute("data-e"), st = "";
      if (hari > CONTENT.eventDate || (hari === CONTENT.eventDate && jam >= e && s !== e) || (hari === CONTENT.eventDate && s === e && jam >= s)) st = "lewat";
      else if (hari === CONTENT.eventDate && jam >= s && jam < e) { st = "kini"; now = li; }
      if (li.getAttribute("data-st") !== st) {
        if (st) li.setAttribute("data-st", st); else li.removeAttribute("data-st");
        var old = li.querySelector(".run-badge"); if (old) old.remove();
        if (st === "kini") li.appendChild(h("b", { class: "run-badge mono", text: "Sekarang" }));
      }
    });
    if (info) {
      if (now) { info.hidden = false; info.textContent = "Sedang berlangsung: " + now.querySelector("span").firstChild.textContent.trim(); }
      else info.hidden = true;
    }
  }

  /* ===================== About: tab tiga kegiatan ===================== */
  (function () {
    var list = document.querySelector(".tabs[role=tablist]"); if (!list) return;
    var tabs = qa("[role=tab]", list), panels = tabs.map(function (t) { return $(t.getAttribute("aria-controls")); });
    function pilih(i, fokus) {
      tabs.forEach(function (t, k) {
        var on = k === i;
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
        panels[k].hidden = !on;
      });
      list.style.setProperty("--i", i);
      if (fokus) tabs[i].focus();
    }
    list.hidden = false;
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { pilih(i); buzz(); });
      t.addEventListener("keydown", function (e) {
        var k = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: tabs.length - 1 }[e.key];
        if (k == null) return; e.preventDefault(); pilih((k + tabs.length) % tabs.length, true);
      });
    });
    function dariHash() {
      var idx = panels.map(function (p) { return "#" + p.id; }).indexOf(location.hash);
      pilih(idx < 0 ? 0 : idx);
      if (idx >= 0) setTimeout(function () { $("kegiatan").scrollIntoView({ block: "start" }); }, 30);
    }
    dariHash();
    window.addEventListener("hashchange", dariHash);
  })();

  /* ===================== About: kartu narasumber dibalik ===================== */
  qa(".spk").forEach(function (card) {
    var front = card.querySelector(".front"), back = card.querySelector(".back");
    var open = card.querySelector(".front .spk-btn"), close = card.querySelector(".back .spk-btn");
    card.classList.add("flip-ready");
    back.inert = true; back.setAttribute("aria-hidden", "true");
    function balik(ke) {
      var b = ke === "back";
      card.classList.toggle("flipped", b);
      front.inert = b; back.inert = !b;
      front.setAttribute("aria-hidden", b ? "true" : "false"); back.setAttribute("aria-hidden", b ? "false" : "true");
      open.setAttribute("aria-expanded", b ? "true" : "false");
      buzz();
      setTimeout(function () { (b ? close : open).focus({ preventScroll: true }); }, REDUCE ? 0 : 260);
    }
    front.addEventListener("click", function () { balik("back"); });
    close.addEventListener("click", function (e) { e.stopPropagation(); balik("front"); });
  });

  /* ===================== About: Personal Statement ===================== */
  (function () {
    var out = $("ps-out"); if (!out) return;
    var F = ["nama", "nilai", "bukti", "aksi", "siapa"].map(function (k) { return [k, $("ps-" + k)]; });
    var CONTOH = [
      ["Raka", "kolaborasi", "memimpin kelompok tugas kelas", "membuat kelas belajar desain tiap Jumat", "teman seangkatan"],
      ["Nadia", "kejujuran", "mengelola kas organisasi SMA", "membuat laporan keuangan angkatan yang terbuka", "seluruh angkatan"],
      ["Bima", "kreativitas", "membuat konten untuk usaha keluarga", "berbagi cara memotret produk dengan HP", "teman yang mulai berjualan"]
    ];
    var ci = 0;
    function render() {
      clear(out);
      var v = {}; F.forEach(function (f) { v[f[0]] = f[1].value.trim(); });
      var part = function (k) { return h("b", { class: v[k] ? "" : "kosong", text: v[k] || "[" + k + "]" }); };
      ["Saya ", part("nama"), ", mahasiswa Bisnis Digital yang peduli pada ", part("nilai"), ". Saya sudah ", part("bukti"), ", dan saya ingin ", part("aksi"), " untuk ", part("siapa"), "."]
        .forEach(function (x) { out.appendChild(typeof x === "string" ? document.createTextNode(x) : x); });
    }
    F.forEach(function (f) { f[1].addEventListener("input", render); });
    var copy = $("ps-copy"), rand = $("ps-rand"), msg = $("ps-msg");
    copy.hidden = false; rand.hidden = false;
    copy.addEventListener("click", function () {
      var t = out.textContent;
      if (/\[(nama|nilai|bukti|aksi|siapa)\]/.test(t)) { msg.textContent = "Lengkapi dulu semua isian."; return; }
      Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(t)).then(function () { msg.textContent = "Tersalin. Bawa ke seminar!"; buzz(); }, function () { msg.textContent = "Tidak bisa menyalin otomatis. Tahan teks untuk menyalin."; });
    });
    rand.addEventListener("click", function () { var c = CONTOH[ci++ % CONTOH.length]; F.forEach(function (f, i) { f[1].value = c[i]; }); render(); msg.textContent = ""; });
    render();
  })();

  /* ===================== Status dari server ===================== */
  function muatStatus() {
    S.lastLoad = Date.now();
    return rpc("status_publik").then(function (r) {
      if (r.error || !r.data) { S.error = true; renderGaleri(); renderVote(); renderDok(); return; }
      S.error = false; S.status = r.data;
      S.offset = new Date(r.data.sekarang).getTime() - Date.now();
      renderGaleri(); renderVote(); renderFase(); renderDok(); muatHasil();
    });
  }

  /* ===================== Jam ===================== */
  function tick() {
    var now = nowMs();
    tickHome(now);
    var st = S.status;
    if (st) {
      var cd = $("vote-cd");
      if (cd) cd.textContent = st.fase === "sebelum" ? sisa(T(st.buka) - now) : sisa(T(st.tutup) - now);
      var lewat = (st.fase === "sebelum" && now >= T(st.buka)) || (st.fase === "buka" && now > T(st.tutup)) || (!st.hasil_terbuka && now >= Math.max(T(st.hasil_at), T(st.tutup)));
      if (lewat && Date.now() - S.lastLoad > 5000) muatStatus();
      if (st.fase === "sebelum" && $("live")) renderFase();
    }
  }

  /* ===================== Mulai ===================== */
  renderTimeline(); renderRundown(); renderGaleri(); renderVote(); renderDok(); tick();
  setInterval(tick, 1000);
  if ($("tl-list") || $("run-list")) setInterval(function () { renderTimeline(); renderRundown(); }, 30000);
  if (sb && (PAGE === "home" || PAGE === "voting")) {
    muatStatus();
    setInterval(function () { if (!inBallot() && V.step !== "selesai") muatStatus(); }, 60000);
  }
})();
