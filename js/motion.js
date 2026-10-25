/* NARASI 2026 · lapisan animasi (GSAP + ScrollTrigger + SplitText, disimpan lokal di vendor/)
   Prinsip (dari skill gsap-web, 60fps-animation, accessible-animation):
   - hanya transform dan opacity yang dianimasikan;
   - semua gerak dibungkus gsap.matchMedia: bila pengguna meminta "kurangi gerak", tidak ada
     satu pun animasi yang dipasang dan halaman tampil statis seperti biasa;
   - tanpa pustaka scroll-jacking (Lenis) dan tanpa pin, supaya bilik suara tetap tenang;
   - bagian bilik suara (#voting) sengaja tidak dianimasikan;
   - kartu dokumentasi berjalan memakai animasi CSS (lihat pages.css), bukan GSAP;
   - gagal apa pun = semua gaya sisipan dibatalkan dan konten tampil apa adanya. */
(function () {
  "use strict";
  var gsap = window.gsap, ST = window.ScrollTrigger, Split = window.SplitText;
  var root = document.documentElement;
  if (!gsap || !ST) { root.classList.remove("pre-motion"); return; }
  gsap.registerPlugin(ST);
  gsap.config({ nullTargetWarn: false });
  if (Split) gsap.registerPlugin(Split);
  ST.config({ ignoreMobileResize: true });

  var $ = function (id) { return document.getElementById(id); };
  var qa = function (sel, ctx) { return [].slice.call((ctx || document).querySelectorAll(sel)); };
  var wait = function (ms) { return new Promise(function (ok) { setTimeout(ok, ms); }); };

  var mm = gsap.matchMedia();
  mm.add("(prefers-reduced-motion: no-preference)", function () {
    var undo = [];            // fungsi pembersih (observer, elemen tambahan)
    var heroDone = false;
    var seen = false;         // sudah pernah melihat intro pada sesi ini
    try { seen = sessionStorage.getItem("narasi-intro") === "1"; sessionStorage.setItem("narasi-intro", "1"); } catch (e) {}

    try {
      root.classList.add("motion");
      undo.push(function () { root.classList.remove("motion"); });
      if (document.querySelector(".hero")) hero(); else pageHead();
      progress();
      scrollspy();
      windows();
      pops();
      era();
      timeline();
      gallery();
      hasil();
      lightbox();
      countdown();
      autoRefresh();
    } catch (err) {
      if (window.console) console.warn("NARASI motion dinonaktifkan:", err);
      root.classList.remove("pre-motion");
      mm.revert();
    }
    return function () {
      undo.forEach(function (f) { try { f(); } catch (e) {} });
      root.classList.remove("pre-motion");
    };

    /* ---------------- util ---------------- */
    function observe(node, opts, fn) {
      if (!node) return;
      var mo = new MutationObserver(fn); mo.observe(node, opts);
      undo.push(function () { mo.disconnect(); });
    }
    /* Transisi CSS pada transform bertabrakan dengan GSAP; matikan selama animasi, pulihkan sesudahnya. */
    function noTransition(list) { list.forEach(function (e) { e.style.transition = "none"; }); }
    function fresh(set, el) { if (set.has(el)) return false; set.add(el); return true; }

    /* ---------------- Hero: portal terbuka, judul jatuh per huruf ---------------- */
    function hero() {
      var q = function (s) { return document.querySelector(".hero " + s); };
      var eyebrow = q(".eyebrow"), title = q(".title"), tagline = q(".tagline"), lead = q(".lead");
      var btns = qa(".hero .cta .btn"), cells = qa(".hero .cd > div"), caps = qa(".hero .cd-cap");
      var loading = q(".loading"), portal = q(".portal"), cd = q(".cd");
      var circles = qa(".portal circle"), labels = qa(".portal text"), ticks = q(".portal g[stroke]");
      var stamp = q(".stamp"), toast = q(".portal-toast"), live = $("live");
      var plain = [eyebrow, tagline, lead].filter(Boolean);

      gsap.set(plain, { opacity: 0, y: 18 });
      gsap.set(btns, { opacity: 0, y: 14, scale: .92 });
      gsap.set(cells, { opacity: 0, y: 16 });
      gsap.set(caps.concat(loading ? [loading] : []), { opacity: 0 });
      if (portal) {
        gsap.set(portal, { opacity: 1 });
        gsap.set(circles, { scale: 0, svgOrigin: "200 200" });
        gsap.set(labels.concat(ticks ? [ticks] : []), { opacity: 0 });
      }
      if (stamp) gsap.set(stamp, { opacity: 0, scale: 0, rotation: -120 });
      if (toast) gsap.set(toast, { opacity: 0 });
      if (live) gsap.set(live, { opacity: 0, y: 10 });
      noTransition(btns);
      root.classList.remove("pre-motion");

      var tl = gsap.timeline({ defaults: { ease: "power3.out" }, onComplete: function () { heroDone = true; } });
      undo.push(function () { tl.kill(); });
      if (eyebrow) tl.to(eyebrow, { opacity: 1, y: 0, duration: .5 }, 0);
      if (portal) {
        tl.to(circles, { scale: 1, duration: .75, stagger: .09, ease: "back.out(1.3)" }, .05)
          .to(labels, { opacity: 1, duration: .35, stagger: .1 }, .8)
          .to(ticks, { opacity: 1, duration: .3 }, 1.1);
      }
      tl.to(tagline, { opacity: 1, y: 0, duration: .55 }, .75)
        .to(lead, { opacity: 1, y: 0, duration: .55 }, .85)
        .to(btns, { opacity: 1, y: 0, scale: 1, duration: .45, stagger: .1, ease: "back.out(2)",
          onComplete: function () { btns.forEach(function (b) { b.style.transition = ""; gsap.set(b, { clearProps: "transform" }); }); } }, 1)
        .to(cells, { opacity: 1, y: 0, duration: .45, stagger: .08 }, 1.1)
        .to(caps.concat(loading ? [loading] : []), { opacity: 1, duration: .4 }, 1.35);
      if (live) tl.to(live, { opacity: 1, y: 0, duration: .4 }, 1.05);
      if (stamp) tl.to(stamp, { opacity: 1, scale: 1, rotation: 0, duration: .7, ease: "back.out(1.7)",
        onComplete: function () { gsap.set(stamp, { clearProps: "transform" }); } }, 1.2);
      if (toast) tl.to(toast, { opacity: 1, duration: .4 }, 1.5);
      var fill = $("load-fill");
      if (fill) tl.from(fill, { scaleX: 0, transformOrigin: "0 50%", duration: 1.1, ease: "power2.out" }, 1.4);

      // Judul: huruf jatuh satu per satu. Dipecah setelah font siap supaya tidak salah ukur.
      var tChars = null;
      if (title && Split) {
        gsap.set(title, { opacity: 0 });
        Promise.race([document.fonts && document.fonts.ready, wait(700)]).then(function () {
          if (!root.classList.contains("motion")) return;
          var split = Split.create(title, { type: "chars" });
          gsap.set(title, { opacity: 1 });
          gsap.set(split.chars, { opacity: 0, yPercent: 70, rotation: 6, transformOrigin: "50% 100%" });
          tChars = gsap.to(split.chars, { opacity: 1, yPercent: 0, rotation: 0, duration: .6, stagger: .05, ease: "back.out(1.8)",
            onComplete: function () { try { split.revert(); } catch (e) {} } });
          if (seen) tChars.timeScale(2.2);
          undo.push(function () { tChars.kill(); try { split.revert(); } catch (e) {} });
        });
      }

      if (seen) tl.timeScale(2.2);

      // Portal bergeser pelan saat hero digulir keluar (parallax ringan, hanya transform)
      if (portal) {
        gsap.to(portal, { y: -48, scale: 1.07, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: .6 } });
      }
    }

    /* ---------------- Kepala halaman About/Voting/Kontak ---------------- */
    function pageHead() {
      var head = document.querySelector(".page-head");
      var parts = head ? qa(":scope > :not(.ph-ring)", head) : [];
      var ring = head && head.querySelector(".ph-ring");
      var bar = document.querySelector(".subnav, .steps");
      var barKids = bar ? qa(":scope > a", bar) : [];
      gsap.set(parts, { opacity: 0, y: 22 });
      if (ring) gsap.set(ring, { opacity: 0, scale: .2, rotation: -160 });
      if (bar) gsap.set(barKids, { opacity: 0, y: 12 });
      root.classList.remove("pre-motion");
      if (ring) gsap.to(ring, { opacity: 1, scale: 1, rotation: 0, duration: .8, ease: "back.out(1.5)", onComplete: function () { gsap.set(ring, { clearProps: "transform,opacity" }); } });
      gsap.to(parts, { opacity: 1, y: 0, duration: .55, stagger: .08, ease: "power3.out", delay: .05 });
      if (barKids.length) gsap.to(barKids, { opacity: 1, y: 0, duration: .4, stagger: .05, ease: "back.out(2)", delay: .3,
        onComplete: function () { gsap.set(barKids, { clearProps: "transform" }); } });
    }

    /* ---------------- Kartu kecil muncul bergantian saat digulir ---------------- */
    function pops() {
      var els = qa(".run li, .spk, .person, .faq details, .acro-link, .dday > div, .ig-card, .cta-big > *")
        .filter(function (e) { return !e.closest(".tabpanel"); });
      if (!els.length) return;
      gsap.set(els, { opacity: 0, y: 22, scale: .97 });
      ST.batch(els, { start: "top 92%", once: true, onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, y: 0, scale: 1, duration: .5, stagger: .07, ease: "back.out(1.6)",
          onComplete: function () { gsap.set(batch, { clearProps: "transform" }); } });
      } });
      var t = setTimeout(function () {   // jaring pengaman
        els.forEach(function (e) { if (+getComputedStyle(e).opacity < 1 && e.getBoundingClientRect().top < innerHeight) gsap.to(e, { opacity: 1, y: 0, scale: 1, duration: .3 }); });
      }, 5000);
      undo.push(function () { clearTimeout(t); });
    }

    /* ---------------- Bilah progres gulir ---------------- */
    function progress() {
      var bar = document.createElement("div");
      bar.id = "m-progress"; bar.setAttribute("aria-hidden", "true");
      document.body.appendChild(bar);
      undo.push(function () { bar.remove(); });
      gsap.to(bar, { scaleX: 1, ease: "none", scrollTrigger: { start: 0, end: "max", scrub: .3 } });
    }

    /* ---------------- Navigasi menandai bagian aktif ---------------- */
    function scrollspy() {
      var links = qa(".subnav a[href^='#'], .steps a[href^='#']");
      function on(id) { links.forEach(function (a) { var m = a.getAttribute("href") === "#" + id; a.classList.toggle("on", m); if (m) a.setAttribute("aria-current", "location"); else a.removeAttribute("aria-current"); }); }
      links.forEach(function (a) {
        var sec = $(a.getAttribute("href").slice(1)); if (!sec) return;
        ST.create({ trigger: sec, start: "top 45%", end: "bottom 45%", onToggle: function (self) { if (self.isActive) on(sec.id); } });
      });
      undo.push(function () { links.forEach(function (a) { a.classList.remove("on"); a.removeAttribute("aria-current"); }); });
    }

    /* ---------------- Jendela terbuka saat digulir ---------------- */
    function windows() {
      var plays = [];
      qa(".win").forEach(function (win) {
        if (win.id === "voting" || win.id === "hasil") return;   // bilik suara tetap tenang; hasil punya animasi sendiri
        var bar = win.querySelector(".win-bar"), body = win.querySelector(".win-body");
        if (!bar || !body) return;
        var kids = [].slice.call(body.children).slice(0, 10);
        gsap.set(win, { opacity: 0, y: 30 });
        gsap.set(kids, { opacity: 0, y: 14 });
        var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
        tl.to(win, { opacity: 1, y: 0, duration: .45 }, 0)
          .from(bar, { scaleX: 0, transformOrigin: "0 50%", duration: .4, ease: "steps(7)", immediateRender: false }, 0)
          .to(kids, { opacity: 1, y: 0, duration: .45, stagger: .07 }, .18);
        plays.push([win, tl]);
        ST.create({ trigger: win, start: "top 88%", once: true, onEnter: function () { tl.play(); } });
      });
      // Yang sudah berada di layar (atau terlewati, mis. tautan #bagian) langsung dibuka.
      requestAnimationFrame(function () {
        plays.forEach(function (p) { if (p[0].getBoundingClientRect().top < innerHeight * .88) p[1].play(); });
      });
      // Jaring pengaman: bila ada jendela yang sudah di layar tetapi belum terbuka, buka paksa.
      var t = setTimeout(function () {
        plays.forEach(function (p) {
          var r = p[0].getBoundingClientRect();
          if (r.top < innerHeight && p[1].progress() === 0) p[1].play();
        });
      }, 5000);
      undo.push(function () { clearTimeout(t); });
    }

    /* ---------------- Era: lompat 1980 > 2000 > 2026 > 2050 ---------------- */
    function era() {
      var parts = qa(".era > *"); if (!parts.length) return;
      gsap.set(parts, { opacity: 0, x: -14 });
      ST.create({ trigger: ".era", start: "top 94%", once: true, onEnter: function () {
        gsap.to(parts, { opacity: 1, x: 0, duration: .4, stagger: .11, ease: "steps(5)", onComplete: function () { gsap.set(parts, { clearProps: "transform" }); } });
      } });
    }

    /* ---------------- Timeline: garis terisi, titik muncul, kartu masuk ---------------- */
    function timeline() {
      var ol = $("tl-list"); if (!ol) return;
      var items = qa(".tl", ol), marks = items.map(function (li) { return li.querySelector(".mk"); });
      gsap.set(items, { opacity: 0, x: 28 });
      gsap.set(marks, { scale: 0 });
      ST.batch(items, { start: "top 90%", once: true, onEnter: function (batch) {
        gsap.to(batch, { opacity: 1, x: 0, duration: .5, stagger: .1, ease: "power3.out" });
        gsap.to(batch.map(function (li) { return li.querySelector(".mk"); }), { scale: 1, duration: .45, stagger: .1, ease: "back.out(2.4)" });
      } });
      gsap.fromTo(ol, { "--p": 0 }, { "--p": 1, ease: "none",
        scrollTrigger: { trigger: ol, start: "top 70%", end: "bottom 60%", scrub: .5 } });
    }

    /* ---------------- Galeri dan calon (dirender belakangan oleh site.js) ---------------- */
    function gallery() {
      var done = new WeakSet();
      function prep(box) {
        var els = qa(".cell, .nosig", box).filter(function (e) { return fresh(done, e); });
        if (!els.length) return;
        gsap.set(els, { opacity: 0, y: 26 });
        var pots = els.reduce(function (a, c) { return a.concat(qa(".pot", c)); }, []);
        var thumbs = els.reduce(function (a, c) { return a.concat(qa(".fthumb img", c)); }, []);
        gsap.set(pots, { opacity: 0, y: 24, rotation: function (i) { return i % 2 ? 2 : -2; } });
        noTransition(thumbs);
        gsap.set(thumbs, { scale: 1.18 });
        ST.batch(els, { start: "top 92%", once: true, onEnter: function (batch) {
          gsap.to(batch, { opacity: 1, y: 0, duration: .5, stagger: .1, ease: "power3.out" });
          batch.forEach(function (cell, i) {
            var cp = qa(".pot", cell), ci = qa(".fthumb img", cell);
            if (cp.length) gsap.to(cp, { opacity: 1, y: 0, rotation: 0, duration: .6, stagger: .12, delay: .25 + i * .1, ease: "back.out(1.6)" });
            if (ci.length) gsap.to(ci, { scale: 1, duration: .9, stagger: .08, delay: .2 + i * .1, ease: "power2.out",
              onComplete: function () { ci.forEach(function (im) { im.style.transition = ""; gsap.set(im, { clearProps: "transform" }); }); } });
          });
        } });
      }
      ["entries", "candidates"].forEach(function (id) {
        var box = $(id); if (!box) return;
        prep(box);
        observe(box, { childList: true }, function () { prep(box); });
      });
    }

    /* ---------------- Hasil: batang tumbuh, angka menghitung, juara distempel ---------------- */
    function hasil() {
      var sec = $("hasil"), rb = $("result-body"); if (!sec || !rb) return;
      var last = null;
      function prep() {
        var rows = qa(".rank-row", rb);
        if (!rows.length || rows[0] === last) return;
        last = rows[0];
        var bars = rows.map(function (r) { return r.querySelector(".bar i"); }).filter(Boolean);
        var nums = rows.map(function (r) { return r.querySelector(".rank-n"); }).filter(Boolean);
        var tags = qa(".rank-no", rb);
        gsap.set(rows, { opacity: 0, x: -22 });
        gsap.set(bars, { scaleX: 0, transformOrigin: "0 50%" });
        gsap.set(tags, { scale: 1.8, rotation: -8, transformOrigin: "0 50%" });
        ST.refresh();
        var tl = gsap.timeline({ paused: true, defaults: { ease: "power3.out" } });
        tl.to(rows, { opacity: 1, x: 0, duration: .45, stagger: .08 }, 0)
          .to(bars, { scaleX: 1, duration: 1, stagger: .08, ease: "power3.out" }, .25)
          .to(tags, { scale: 1, rotation: 0, duration: .5, stagger: .08, ease: "back.out(2.4)" }, .35);
        nums.forEach(function (el, i) {
          var m = el.textContent.match(/^(\d+)(.*)$/); if (!m) return;
          var final = el.textContent, n = parseInt(m[1], 10), rest = m[2], o = { v: 0 };
          tl.to(o, { v: n, duration: 1, ease: "power2.out",
            onUpdate: function () { el.textContent = Math.round(o.v) + rest; },
            onComplete: function () { el.textContent = final; } }, .25 + i * .08);
        });
        ST.create({ trigger: sec, start: "top 80%", once: true, onEnter: function () { tl.play(); } });
        var t = setTimeout(function () { if (tl.progress() === 0) tl.play(); }, 6000);   // jaring pengaman
        undo.push(function () { clearTimeout(t); });
      }
      observe(rb, { childList: true }, prep);
      prep();
    }

    /* ---------------- Lightbox membuka dengan gerak singkat ---------------- */
    function lightbox() {
      observe(document.body, { childList: true }, function (muts) {
        muts.forEach(function (m) {
          [].forEach.call(m.addedNodes, function (n) {
            if (!(n.nodeType === 1 && n.classList.contains("lb"))) return;
            var img = n.querySelector("img"), cap = n.querySelector("figcaption");
            gsap.fromTo(n, { opacity: 0 }, { opacity: 1, duration: .2, ease: "none" });
            if (img) gsap.fromTo(img, { scale: .9, y: 24 }, { scale: 1, y: 0, duration: .4, ease: "back.out(1.5)" });
            if (cap) gsap.fromTo(cap, { opacity: 0 }, { opacity: 1, duration: .3, delay: .2 });
            n.addEventListener("lb:geser", function (ev) {
              if (img) gsap.fromTo(img, { x: 40 * ev.detail, opacity: .3 }, { x: 0, opacity: 1, duration: .3, ease: "power2.out", overwrite: true });
            });
          });
        });
      });
    }

    /* ---------------- Angka hitung mundur bergulir saat berganti ---------------- */
    function countdown() {
      ["cd-d", "cd-h", "cd-m", "cd-s"].forEach(function (id) {
        var el = $(id); if (!el) return;
        var prev = el.textContent;
        observe(el, { childList: true, characterData: true, subtree: true }, function () {
          var now = el.textContent;
          if (now === prev) return;
          prev = now;
          if (!heroDone) return;
          gsap.fromTo(el, { yPercent: -35, opacity: .25 }, { yPercent: 0, opacity: 1, duration: .28, ease: "power2.out", overwrite: true });
        });
      });
    }

    /* ---------------- Tinggi halaman berubah (galeri, bilik suara) = hitung ulang pemicu ---------------- */
    function autoRefresh() {
      if (!window.ResizeObserver) return;
      var timer = null, h0 = document.body.scrollHeight;
      var ro = new ResizeObserver(function () {
        var h1 = document.body.scrollHeight;
        if (Math.abs(h1 - h0) < 4) return;
        h0 = h1; clearTimeout(timer); timer = setTimeout(function () { ST.refresh(); }, 250);
      });
      ro.observe(document.body);
      undo.push(function () { ro.disconnect(); clearTimeout(timer); });
    }
  });
})();
