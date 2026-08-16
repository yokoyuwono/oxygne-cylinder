import { MetodeBayar, Transaction } from '../types';
import { barisPendapatan } from './laporanHarian';

/**
 * Metode bayar dan rekapnya.
 *
 * "Pemasukan" di Laporan Harian memberi tahu berapa yang masuk, tapi tidak lewat
 * mana. Memisahkan tunai dari transfer membuat uang di laci bisa dicocokkan dengan
 * catatan -- selisih yang selama ini tidak terlihat jadi kelihatan hari itu juga,
 * bukan sebulan kemudian.
 *
 * Daftarnya sengaja tetap di kode dan pendek, sama seperti pos belanja di
 * lib/pengeluaran.ts.
 */

export interface KelompokMetode {
  id: string;
  label: string;
  ikon: string;
}

/** Pilihan yang ditawarkan saat mencatat pemasukan. */
export const METODE_BAYAR: { id: MetodeBayar; label: string; ikon: string }[] = [
  { id: 'CASH', label: 'Tunai', ikon: 'payments' },
  { id: 'TRANSFER', label: 'Transfer', ikon: 'account_balance' },
];

/**
 * Sewa yang dibayar nanti.
 *
 * Tidak ditawarkan sebagai pilihan: uangnya belum berpindah, jadi belum ada
 * metodenya. Tapi tetap harus muncul di rincian -- Laporan Harian menghitung sewa
 * kredit sebagai pemasukan hari itu, dan mengeluarkannya membuat rincian tidak akan
 * pernah cocok dengan totalnya.
 */
const BELUM_DIBAYAR: KelompokMetode = {
  id: 'BELUM_DIBAYAR',
  label: 'Belum Dibayar',
  ikon: 'money_off',
};

/**
 * Penampung baris yang metodenya kosong atau tak dikenal.
 *
 * Seluruh catatan sebelum kolomnya ada jatuh ke sini, begitu juga nilai yang tidak
 * ada di daftar. Keduanya tetap terhitung supaya rincian per metode menjumlah persis
 * sama dengan kartu Pemasukan -- rekap yang selisih sedikit lebih buruk daripada
 * rekap yang tidak ada.
 */
const TIDAK_DICATAT: KelompokMetode = {
  id: 'TIDAK_DICATAT',
  label: 'Tidak Dicatat',
  ikon: 'help_outline',
};

const petaMetode = new Map<string, KelompokMetode>(METODE_BAYAR.map(m => [m.id, m]));

/**
 * Kelompok sebuah baris pemasukan.
 *
 * Status lunas diperiksa lebih dulu daripada metodenya: baris bon memang tidak
 * pernah diberi metode, dan kalaupun suatu saat terisi, yang benar tetap "belum
 * dibayar" -- uangnya belum ada di mana pun.
 */
export const kelompokMetode = (t: Transaction): KelompokMetode =>
  t.paymentStatus === 'UNPAID'
    ? BELUM_DIBAYAR
    : petaMetode.get(t.paymentMethod ?? '') ?? TIDAK_DICATAT;

export interface BarisMetode extends KelompokMetode {
  total: number;
  persen: number;
}

/**
 * Pemasukan dipecah per metode, urut dari yang terbesar.
 *
 * Memakai ulang predikat barisPendapatan, bukan filter sendiri: kalau keduanya
 * berbeda, rincian dan kartu Pemasukan akan berselisih dan tidak ada yang tahu mana
 * yang benar.
 */
export function rekapPemasukanPerMetode(transactions: Transaction[]): BarisMetode[] {
  const total = new Map<string, BarisMetode>();

  for (const t of transactions) {
    if (!barisPendapatan(t)) continue;

    const metode = kelompokMetode(t);
    const baris = total.get(metode.id) ?? { ...metode, total: 0, persen: 0 };
    baris.total += t.cost || 0;
    total.set(metode.id, baris);
  }

  const semua = [...total.values()];
  const jumlah = semua.reduce((n, b) => n + b.total, 0);

  return semua
    .map(b => ({ ...b, persen: jumlah > 0 ? (b.total / jumlah) * 100 : 0 }))
    .sort((a, b) => b.total - a.total);
}
