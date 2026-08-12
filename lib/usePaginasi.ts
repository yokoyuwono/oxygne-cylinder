import { useEffect, useMemo, useState } from 'react';

/**
 * Paginasi di sisi browser.
 *
 * Sengaja tidak menyentuh database. Seluruh transaksi memang sudah ada di memori
 * -- App memuatnya saat login karena perhitungan stok memutar ulang seluruh riwayat
 * (lihat lib/bulkStock.ts) -- jadi memotong array yang sudah dibayar itu memakai nol
 * query dan nol egress, sementara paginasi server-side justru menambah satu
 * permintaan tiap kali halaman berganti.
 *
 * Yang dihemat di sini bukan bebannya database, melainkan jumlah baris yang masuk
 * DOM: daftar tanpa batas yang menggantung browser, bukan querynya.
 */
export function usePaginasi<T>(baris: T[], perHalaman: number) {
  const [halaman, setHalaman] = useState(1);

  // Balik ke halaman 1 setiap isi daftarnya berganti. Tanpa ini, menyaring saat
  // sedang di halaman 8 menyisakan layar kosong -- hasil saringannya cuma 2 halaman.
  useEffect(() => { setHalaman(1); }, [baris]);

  const totalBaris = baris.length;
  const totalHalaman = Math.max(1, Math.ceil(totalBaris / perHalaman));

  // Dijepit saat render, bukan hanya lewat effect di atas: effect berjalan setelah
  // render, jadi tanpa penjepit ini ada satu frame yang menampilkan halaman kosong.
  const halamanAman = Math.min(halaman, totalHalaman);

  const halamanIni = useMemo(
    () => baris.slice((halamanAman - 1) * perHalaman, halamanAman * perHalaman),
    [baris, halamanAman, perHalaman]);

  return { halamanIni, halaman: halamanAman, totalHalaman, totalBaris, perHalaman, setHalaman };
}
