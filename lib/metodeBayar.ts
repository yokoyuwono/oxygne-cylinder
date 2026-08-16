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
 * Pemasukan dipecah per metode: tunai dan transfer lebih dulu, sisanya urut dari
 * yang terbesar.
 *
 * Urutannya tidak murni berdasarkan nominal. Tunai dan transfer adalah pemisahan
 * yang dicari orang saat membuka laporan; menaruhnya di bawah "Tidak Dicatat" cuma
 * karena angkanya sedang kecil membuat yang dicari justru paling sulit ditemukan.
 * Kelompok penampung adalah sisa, jadi tempatnya memang di belakang.
 *
 * Memakai ulang predikat barisPendapatan, bukan filter sendiri: kalau keduanya
 * berbeda, rincian dan kartu Pemasukan akan berselisih dan tidak ada yang tahu mana
 * yang benar.
 */
export function rekapPemasukanPerMetode(transactions: Transaction[]): BarisMetode[] {
  // Tunai dan transfer selalu muncul, walau nol. Pemisahannya baru bisa dibaca sebagai
  // pemisahan kalau kedua sisinya kelihatan -- satu baris "Tunai" sendirian menyisakan
  // pertanyaan apakah transfernya nol atau memang tidak dicatat.
  const total = new Map<string, BarisMetode>(
    METODE_BAYAR.map(m => [m.id, { ...m, total: 0, persen: 0 }])
  );

  for (const t of transactions) {
    if (!barisPendapatan(t)) continue;

    const metode = kelompokMetode(t);
    const baris = total.get(metode.id) ?? { ...metode, total: 0, persen: 0 };
    baris.total += t.cost || 0;
    total.set(metode.id, baris);
  }

  const semua = [...total.values()];
  const jumlah = semua.reduce((n, b) => n + b.total, 0);

  const urutanPokok = METODE_BAYAR.map(m => m.id as string);
  const peringkat = (b: BarisMetode) => {
    const i = urutanPokok.indexOf(b.id);
    return i >= 0 ? i : urutanPokok.length;
  };

  return semua
    .map(b => ({ ...b, persen: jumlah > 0 ? (b.total / jumlah) * 100 : 0 }))
    .sort((a, b) => peringkat(a) - peringkat(b) || b.total - a.total);
}
