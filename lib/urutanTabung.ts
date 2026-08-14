/**
 * Urutan baku tabung di layar.
 *
 * Petugas mencari tabung berdasarkan kodenya, dan kode itu punya urutan yang sudah
 * hidup di kepala mereka jauh sebelum ada aplikasi ini: YK paling depan, lalu kode
 * oksigen lainnya, baru gas selain oksigen. Selama daftarnya muncul apa adanya
 * mengikuti urutan data dari database, mencari satu kode berarti menyapu ratusan
 * baris dengan mata.
 *
 * Diurut dari PREFIKS KODE, bukan dari kolom gasType, meski C2H2 dan AR memang gas
 * lain. Kolom itu tidak bisa dipercaya di data ini: 'AR/YK' tercatat dua kali dengan
 * gas berbeda (Argon dan Oxygen), dan 257 tabung ber-'Acetyline' salah eja (lihat
 * catatan di labels.ts). Kodenya jauh lebih rapi daripada jenis gasnya, jadi seluruh
 * urutan berdiri di atas kode saja dan tidak ikut rusak saat gasType-nya keliru.
 */

/** Prefiks kode yang punya tempat tetap. Yang tidak di sini jatuh ke bawah. */
export const URUTAN_PREFIKS = ['YK', 'SL', 'M', 'R', 'R2', 'C2H2', 'AR'];

/**
 * Prefiks sebuah kode seri -- potongan sebelum tanda hubung.
 *
 * Konvensi yang sama sudah dipakai halaman Pabrik untuk menebak SKU vendor, jadi
 * "R-8508" berprefiks R dan "C2H2-1120" berprefiks C2H2. Disamakan ke huruf besar
 * karena kode di data produksi tidak konsisten kapitalisasinya.
 */
export function prefiksTabung(serialCode: string): string {
  return (serialCode || '').split('-')[0].trim().toUpperCase();
}

/** Posisi prefiks pada urutan baku; yang tidak terdaftar dapat nomor paling akhir. */
function peringkatPrefiks(prefiks: string): number {
  const posisi = URUTAN_PREFIKS.indexOf(prefiks);
  return posisi === -1 ? URUTAN_PREFIKS.length : posisi;
}

/**
 * Angka pada kode seri, mis. 8508 dari "R-8508".
 *
 * Dipakai supaya urutannya menaik secara angka, bukan teks. Perbandingan teks
 * menaruh "R-999" di bawah "R-1000", dan kode di sini tidak selalu berpadding nol --
 * "M-0064" bersanding dengan "R2-103" di armada yang sama.
 */
function nomorTabung(serialCode: string): number | null {
  const sesudahHubung = (serialCode || '').split('-').slice(1).join('-');
  const angka = sesudahHubung.match(/\d+/);
  return angka ? Number(angka[0]) : null;
}

export interface BerkodeSeri {
  serialCode: string;
}

/**
 * Pembanding dua tabung: prefiks dulu, baru angkanya.
 *
 * Kode tanpa tanda hubung atau tanpa angka sama sekali dibandingkan sebagai teks
 * biasa -- data produksi memuat baris seperti itu (ada satu yang prefiksnya terbaca
 * 'Jenis'), dan yang penting tempatnya tetap, bukan cantik.
 */
export function bandingkanTabung(a: BerkodeSeri, b: BerkodeSeri): number {
  const prefiksA = prefiksTabung(a.serialCode);
  const prefiksB = prefiksTabung(b.serialCode);

  const peringkatA = peringkatPrefiks(prefiksA);
  const peringkatB = peringkatPrefiks(prefiksB);
  if (peringkatA !== peringkatB) return peringkatA - peringkatB;

  // Sesama prefiks tak terdaftar: diurut abjad supaya tetap punya urutan yang pasti.
  if (prefiksA !== prefiksB) return prefiksA.localeCompare(prefiksB);

  const nomorA = nomorTabung(a.serialCode);
  const nomorB = nomorTabung(b.serialCode);
  if (nomorA !== null && nomorB !== null) return nomorA - nomorB;
  if (nomorA !== null) return -1;
  if (nomorB !== null) return 1;

  return (a.serialCode || '').localeCompare(b.serialCode || '');
}

/** Salinan terurut; array asal tidak disentuh supaya aman dipakai di dalam useMemo. */
export function urutkanTabung<T extends BerkodeSeri>(daftar: T[]): T[] {
  return [...daftar].sort(bandingkanTabung);
}
