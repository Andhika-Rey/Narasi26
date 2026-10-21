/* NARASI 2026 · situs publik
   Konten statis (timeline, rundown) ada di blok CONTENT. Data karya, calon,
   jadwal voting, dan hasil selalu diambil dari server (Supabase). */
(function () {
  "use strict";

  /* ===================== Konten statis ===================== */
  var CONTENT = {
    instagram: "narasi2026.id",
    event: "2026-11-13T09:00:00+07:00",
    start: "2026-10-12T00:00:00+07:00",
    timeline: [
      { from: "2026-10-12", to: "2026-10-16", title: "Pendaftaran", detail: "Peserta sayembara identitas dan pasangan calon Ketua dan Wakil." },
      { from: "2026-10-19", to: "2026-10-23", title: "Pengumpulan karya dan visi misi", detail: "Paket identitas dan penyampaian visi misi pasangan calon." },
      { from: "2026-10-26", to: "2026-10-26", title: "Publikasi", detail: "Karya sayembara dan pasangan calon tayang di Instagram dan di halaman ini." },
      { from: "2026-10-26", to: "2026-10-30", title: "Kampanye dan voting", detail: "Seluruh mahasiswa Bisnis Digital 2026 memberikan suara." },
      { from: "2026-11-02", to: "2026-11-06", title: "Rekapitulasi dan verifikasi", detail: "Panitia memeriksa data dan menyiapkan puncak acara." },
      { from: "2026-11-09", to: "2026-11-12", title: "Finalisasi persiapan", detail: "Seminar, perlengkapan, dan koordinasi hari-H." },
      { from: "2026-11-13", to: "2026-11-13", title: "Puncak acara NARASI", detail: "Seminar, pengumuman Ketua dan Wakil, serta pemenang sayembara." }
    ],
    rundown: [
      ["08.30–09.00", "Registrasi dan persiapan"],
      ["09.00–09.10", "Pembukaan"],
      ["09.10–09.30", "Sambutan"],
      ["09.30–09.55", "Narasumber 1"],
      ["09.55–10.20", "Narasumber 2"],
      ["10.20–10.30", "Ice breaking"],
      ["10.30–10.55", "Narasumber 3"],
      ["10.55–11.00", "Pemberian sertifikat dan dokumen"],
      ["11.00–12.45", "ISOMA"],
      ["12.45–13.15", "Games: Tebak Gaya"],
      ["13.15–13.30", "Pengumuman Ketua dan Wakil Ketua"],
      ["13.30–13.45", "Pengumuman pemenang sayembara"],
      ["13.45", "Selesai"]
    ]
  };

  /* ===================== Util ===================== */
  var MON = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  var $ = function (id) { return document.getElementById(id); };
  var pad = function (n) { return String(n).padStart(2, "0"); };
  var T = function (s) { return new Date(s).getTime(); };
  var safeUrl = function (u) { return /^https?:\/\//i.test(u || "") ? u : ""; };
  /* Foto: yang disimpan di database hanya path di bucket "narasi"; URL disusun di sini. */
  var fotoUrl = function (path) {
    var base = (window.NARASI_CONFIG || {}).SUPABASE_URL || "";
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
  function fmtWaktu(iso) { return fmtFull.format(new Date(iso)).replace(/\./g, ".") + " WIB"; }
  function sisa(ms) {
    var s = Math.max(0, Math.floor(ms / 1000)), d = Math.floor(s / 86400), j = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60);
    if (d > 0) return d + " hari " + j + " jam lagi";
    if (j > 0) return j + " jam " + m + " menit lagi";
    return m + " menit " + (s % 60) + " detik lagi";
  }

  /* ===================== Backend ===================== */
  var CFG = window.NARASI_CONFIG || {};
  if (CFG.SUPABASE_URL) CFG.SUPABASE_URL = String(CFG.SUPABASE_URL).trim().replace(/\/(rest|auth)\/v1.*$/, "").replace(/\/+$/, "");
  var sb = null;
  try {
    if (window.supabase && CFG.SUPABASE_URL && CFG.SUPABASE_ANON_KEY) {
      sb = window.supabase.createClient(CFG.SUPABASE_URL, CFG.SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
      });
    } else {
      console.warn("NARASI: js/config.js belum diisi. Bilik suara dan galeri dinonaktifkan.");
    }
  } catch (e) { console.error(e); }

  function rpc(name, args) {
    if (!sb) return Promise.resolve({ error: { message: "backend-belum-diatur" } });
    return Promise.resolve(sb.rpc(name, args || {})).then(function (r) { return r; }, function (e) { return { error: e || { message: "jaringan" } }; });
  }

  var S = { status: null, offset: 0, error: false, hasilDimuat: false, lastLoad: 0, galeriKey: "" };
  var nowMs = function () { return Date.now() + S.offset; };

  /* ===================== Header: instagram, countdown ===================== */
  var EVENT = T(CONTENT.event), START = T(CONTENT.start);
  $("ig-link").textContent = "@" + CONTENT.instagram;
  $("ig-link").href = "https://www.instagram.com/" + CONTENT.instagram + "/";
  $("ig-note").textContent = "@" + CONTENT.instagram;

  /* ===================== Timeline & rundown ===================== */
  function rangeText(from, to) {
    var a = from.split("-").map(Number), b = to.split("-").map(Number);
    if (from === to) return a[2] + " " + MON[a[1] - 1] + " " + a[0];
    if (a[1] === b[1]) return a[2] + "–" + b[2] + " " + MON[a[1] - 1] + " " + a[0];
    return a[2] + " " + MON[a[1] - 1] + " – " + b[2] + " " + MON[b[1] - 1] + " " + a[0];
  }
  var LABEL = { selesai: "Selesai", berlangsung: "Berlangsung", berikutnya: "Berikutnya", mendatang: "Mendatang" };
  function renderTimeline() {
    var now = nowMs(), firstNext = -1;
    CONTENT.timeline.forEach(function (it, i) { if (firstNext < 0 && T(it.from + "T00:00:00+07:00") > now) firstNext = i; });
    var ol = $("tl-list"); clear(ol);
    CONTENT.timeline.forEach(function (it, i) {
      var s = T(it.from + "T00:00:00+07:00"), e = T(it.to + "T23:59:59+07:00"), st;
      if (now > e) st = "selesai"; else if (now >= s) st = "berlangsung"; else st = (i === firstNext ? "berikutnya" : "mendatang");
      ol.appendChild(h("li", { class: "tl", "data-state": st }, [
        h("span", { class: "mk", "aria-hidden": "true" }),
        h("div", { class: "card" }, [
          h("div", { class: "when" }, [h("span", { class: "mono", text: rangeText(it.from, it.to) }), h("span", { class: "chip", text: LABEL[st] })]),
          h("h3", { text: it.title }), h("p", { text: it.detail })
        ])
      ]));
    });
  }
  (function () {
    var dl = $("rundown");
    CONTENT.rundown.forEach(function (r) { dl.appendChild(h("dt", { text: r[0] })); dl.appendChild(h("dd", { text: r[1] })); });
  })();

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
    return h("div", { class: "fstrip" }, urls.map(function (u, i) {
      var img = h("img", { src: u, alt: alt + ", foto " + (i + 1), loading: "lazy", decoding: "async" });
      var b = h("button", { type: "button", class: "fthumb", "aria-label": "Perbesar foto " + (i + 1) + " " + alt, onclick: function () { bukaLb(u, alt, alt, b); } }, img);
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
        else { var b = h("button", { type: "button", "aria-label": "Perbesar foto " + peran + " " + nama, onclick: function () { bukaLb(u, peran + ": " + nama, peran + " · " + nama, b); } }, img); box.appendChild(b); }
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
    sec.hidden = false; $("nav-hasil").hidden = false; clear(root);
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
    if (S.hasilDimuat || !S.status || !S.status.hasil_terbuka) return;
    S.hasilDimuat = true;
    rpc("hasil_publik").then(function (r) {
      if (r.error || !r.data || !r.data.terbuka) { S.hasilDimuat = false; return; }
      renderHasil(r.data);
    });
  }

  /* ===================== Status dari server ===================== */
  function muatStatus() {
    S.lastLoad = Date.now();
    return rpc("status_publik").then(function (r) {
      if (r.error || !r.data) { S.error = true; renderGaleri(); renderVote(); return; }
      S.error = false; S.status = r.data;
      S.offset = new Date(r.data.sekarang).getTime() - Date.now();
      renderGaleri(); renderVote(); muatHasil();
    });
  }

  /* ===================== Jam ===================== */
  function tick() {
    var now = nowMs(), s = Math.max(0, Math.floor((EVENT - now) / 1000));
    $("cd-d").textContent = pad(Math.floor(s / 86400));
    $("cd-h").textContent = pad(Math.floor(s % 86400 / 3600));
    $("cd-m").textContent = pad(Math.floor(s % 3600 / 60));
    $("cd-s").textContent = pad(s % 60);
    var pct = Math.max(0, Math.min(100, Math.round((now - START) / (EVENT - START) * 100)));
    $("load-pct").textContent = pct + "%"; $("load-fill").style.width = pct + "%"; $("load-bar").setAttribute("aria-valuenow", pct);

    var st = S.status;
    if (st) {
      var cd = $("vote-cd");
      if (cd) cd.textContent = st.fase === "sebelum" ? sisa(T(st.buka) - now) : sisa(T(st.tutup) - now);
      var lewat = (st.fase === "sebelum" && now >= T(st.buka)) || (st.fase === "buka" && now > T(st.tutup)) || (!st.hasil_terbuka && now >= Math.max(T(st.hasil_at), T(st.tutup)));
      if (lewat && Date.now() - S.lastLoad > 5000) muatStatus();
    }
  }

  /* ===================== Lightbox foto ===================== */
  var lb = null, lastBtn = null;
  function closeLb() { if (lb) { lb.remove(); lb = null; document.removeEventListener("keydown", onKey); if (lastBtn) lastBtn.focus(); } }
  function onKey(e) { if (e.key === "Escape") closeLb(); }
  function bukaLb(src, alt, cap, btn) {
    closeLb(); lastBtn = btn;
    var img = h("img", { src: src, alt: alt });
    var x = h("button", { type: "button", class: "x", text: "Tutup ×" });
    lb = h("div", { class: "lb", role: "dialog", "aria-modal": "true", "aria-label": "Foto", onclick: closeLb }, [
      x, h("figure", null, [img, h("figcaption", { class: "mono", text: cap || "" })])]);
    document.body.appendChild(lb); x.focus(); document.addEventListener("keydown", onKey);
  }
  document.querySelectorAll(".shot button").forEach(function (b) {
    b.addEventListener("click", function () { bukaLb(b.dataset.full, b.querySelector("img").alt, b.dataset.cap, b); });
  });

  /* ===================== Mulai ===================== */
  renderTimeline(); renderGaleri(); renderVote(); tick();
  setInterval(tick, 1000);
  setInterval(renderTimeline, 60000);
  if (sb) {
    muatStatus();
    setInterval(function () { if (!inBallot() && V.step !== "selesai") muatStatus(); }, 60000);
  }
})();
