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
 * YANG DIPECAH ADALAH PEMASUKAN, BUKAN UANG MASUK. Nilainya diambil dari
 * barisPendapatan dan cost, sama seperti kartu Pemasukan -- angka yang memberi makan
 * Laba Bersih. Dulu di sini dipakai uangMasukBaris, yang ikut menambahkan titipan
 * deposit; akibatnya baris "Tunai" memuat uang pelanggan yang harus dikembalikan
 * (bukan pemasukan, dan tidak selalu uang tunai), dan jumlah seluruh rincian
 * berselisih dengan laba tepat sebesar deposit hari itu -- persis pada hari ada sewa
 * baru, sehingga selisihnya muncul kadang-kadang dan terlihat seperti salah hitung.
 *
 * Karena itu titipan sengaja TIDAK ikut di sini; tempatnya di kartu arus kas pada
 * laporan yang sama, yang menyebutnya sendiri sebagai deposit. Aturan uangnya tetap
 * satu tempat di lib/laporanHarian.ts.
 *
 * Baris yang belum dibayar (bon) tetap ikut, sebagai kelompoknya sendiri: Laporan
 * Harian mengakui sewa kredit dan pesanan berbunyi bon sebagai pemasukan pada hari
 * itu, jadi mengeluarkannya justru akan membuat rincian tidak pernah cocok lagi
 * dengan kartu Pemasukan. Yang penting uangnya TIDAK duduk di baris "Tunai" orang
 * yang membacanya sebagai isi laci.
 */
export function rekapPemasukanPerMetode(transactions: Transaction[]): BarisMetode[] {
  // Tunai dan transfer selalu muncul, walau nol. Pemisahannya baru bisa dibaca sebagai
  // pemisahan kalau kedua sisinya kelihatan -- satu baris "Tunai" sendirian menyisakan
  // pertanyaan apakah transfernya nol atau memang tidak dicatat.
  const total = new Map<string, BarisMetode>(
    METODE_BAYAR.map(m => [m.id, { ...m, total: 0, persen: 0 }])
  );

  for (const t of transactions) {
    // Pemasukan saja, sebesar cost-nya: uang yang belum berpindah (bon) tetap ikut
    // karena laporan mengakuinya sebagai pemasukan hari itu, sedangkan titipan
    // deposit tidak pernah ikut karena ia bukan pendapatan.
    if (!barisPendapatan(t)) continue;
    const nilai = Number(t.cost) || 0;
    if (nilai <= 0) continue;

    const metode = kelompokMetode(t);
    const baris = total.get(metode.id) ?? { ...metode, total: 0, persen: 0 };
    baris.total += nilai;
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
