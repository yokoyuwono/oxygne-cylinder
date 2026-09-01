import { Transaction } from '../types';
import { barisPengeluaran } from './laporanHarian';

/**
 * Pos belanja dan rekapnya.
 *
 * "Total Pengeluaran" di tab Keuangan memberi tahu berapa yang keluar, tapi tidak
 * ke mana. Pos belanja memecah angka itu supaya bisa ditindaklanjuti -- terlihat
 * kalau solar sebulan ini dua kali lipat bulan lalu, bukan cuma tahu totalnya naik.
 *
 * Daftarnya sengaja tetap di kode dan pendek. Pos yang terlalu rinci membuat orang
 * ragu memilih dan akhirnya memilih asal, dan pos yang dipilih asal lebih menyesatkan
 * daripada tidak ada pos sama sekali.
 */

export interface KategoriPengeluaran {
  id: string;
  label: string;
  ikon: string;
}

/** Pilihan yang ditawarkan saat mencatat pengeluaran dari tab Keuangan. */
export const KATEGORI_PENGELUARAN: KategoriPengeluaran[] = [
  { id: 'BBM_TRANSPORT', label: 'BBM & Transport', ikon: 'local_shipping' },
  { id: 'GAJI_UPAH', label: 'Gaji & Upah', ikon: 'badge' },
  { id: 'ATK_PERLENGKAPAN', label: 'ATK & Perlengkapan', ikon: 'inventory_2' },
  { id: 'PERAWATAN_ALAT', label: 'Perawatan Alat', ikon: 'build' },
  { id: 'LISTRIK_AIR', label: 'Listrik & Air', ikon: 'bolt' },
  { id: 'SEWA_TEMPAT', label: 'Sewa Tempat', ikon: 'store' },
  { id: 'LAINNYA', label: 'Lain-lain', ikon: 'more_horiz' },
];

/**
 * Penampung baris yang posnya kosong atau tak dikenal.
 *
 * Pengeluaran dari halaman /kas tidak punya pilihan pos, dan seluruh catatan
 * sebelum kolomnya ada juga kosong. Keduanya jatuh ke sini supaya rincian per pos
 * tetap menjumlah persis sama dengan kartu Total Pengeluaran -- rekap yang selisih
 * sedikit lebih buruk daripada rekap yang tidak ada.
 */
const POS_LAINNYA = KATEGORI_PENGELUARAN[KATEGORI_PENGELUARAN.length - 1];

/** Dipakai juga di App.tsx untuk menandai baris kekurangan bayar ke pabrik. */
export const POS_ISI_ULANG_ID = 'ISI_ULANG_GAS';

/**
 * Pos bawaan untuk biaya isi ulang ke pabrik.
 *
 * Tidak ditawarkan sebagai pilihan: barisnya lahir sendiri dari alur isi ulang
 * (REFILL_IN), tidak pernah diketik tangan. Tapi tetap harus muncul di rincian --
 * ini pengeluaran terbesar toko, dan mengeluarkannya membuat rincian tidak akan
 * pernah cocok dengan totalnya.
 */
const POS_ISI_ULANG: KategoriPengeluaran = {
  id: POS_ISI_ULANG_ID,
  label: 'Isi Ulang Gas',
  ikon: 'local_gas_station',
};

/** Isian form pengeluaran di tab Keuangan. */
export interface PengeluaranPayload {
  description: string;
  amount: number;
  date: string;
  kategori: string;
}

const petaKategori = new Map(KATEGORI_PENGELUARAN.map(k => [k.id, k]));

/**
 * Pos sebuah baris pengeluaran; yang kosong maupun tak dikenal jadi "Lain-lain".
 *
 * Kekurangan bayar ke pabrik datang sebagai EXPENSE tanpa tabung, bukan REFILL_IN --
 * lihat handleReceiveFromRefill di App.tsx. Posnya dikenali dari category supaya ia
 * tetap berkumpul dengan biaya isi ulang yang lain, bukan tersasar ke "Lain-lain".
 */
export const posTransaksi = (t: Transaction): KategoriPengeluaran =>
  t.type === 'REFILL_IN' || t.category === POS_ISI_ULANG_ID
    ? POS_ISI_ULANG
    : petaKategori.get(t.category ?? '') ?? POS_LAINNYA;

/** Nama pos untuk ditampilkan, dari id yang tersimpan. */
export const labelKategoriPengeluaran = (id?: string) =>
  (petaKategori.get(id ?? '') ?? POS_LAINNYA).label;

export interface BarisPos extends KategoriPengeluaran {
  total: number;
  persen: number;
}

/**
 * Pengeluaran dipecah per pos, urut dari yang terbesar.
 *
 * Memakai ulang predikat barisPengeluaran, bukan filter sendiri: kalau keduanya
 * berbeda, rincian dan kartu Total Pengeluaran akan berselisih dan tidak ada yang
 * tahu mana yang benar.
 */
export function rekapPengeluaranPerKategori(transactions: Transaction[]): BarisPos[] {
  const total = new Map<string, BarisPos>();

  for (const t of transactions) {
    if (!barisPengeluaran(t)) continue;

    const pos = posTransaksi(t);
    const baris = total.get(pos.id) ?? { ...pos, total: 0, persen: 0 };
    baris.total += t.cost || 0;
    total.set(pos.id, baris);
  }

  const semua = [...total.values()];
  const jumlah = semua.reduce((n, b) => n + b.total, 0);

  return semua
    .map(b => ({ ...b, persen: jumlah > 0 ? (b.total / jumlah) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}
