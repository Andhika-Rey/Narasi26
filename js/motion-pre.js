/* Dipasang di <head>, sebelum gambar pertama. Hanya menandai bahwa animasi akan jalan
   (pengguna tidak meminta gerak berkurang) agar bagian hero tidak berkedip.
   Bila motion.js gagal dimuat, CSS tetap menampilkan semuanya setelah 2,5 detik. */
(function () {
  try {
    if (window.matchMedia && !window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      document.documentElement.classList.add("pre-motion");
    }
  } catch (e) { /* tanpa animasi */ }
})();
