import { RentalTariff, Transaction } from '../types';
import { barisPendapatan } from './laporanHarian';
import { sebutanBarang } from './bulkStock';

/**
 * Regulator sebagai sumber pendapatan.
 *
 * Stoknya diurus lib/bulkStock.ts -- berapa unit dimiliki dan berapa yang sedang
 * beredar. Berkas ini mengurus sisi uangnya: berapa rupiah yang masuk dari sewa dan
 * penjualan regulator, angka yang selama ini tersimpan di kolom transaksi tapi tidak
 * pernah ditampilkan di mana pun.
 */

/**
 * Tarif regulator yang sedang dipakai.
 *
 * Cuma satu yang boleh aktif dalam satu waktu. Pencarian ini sebelumnya disalin
 * inline di tiga tempat (dua form dan alur pengembalian); disatukan di sini supaya
 * form dan laporan tidak bisa menunjuk tarif yang berbeda.
 */
export const tarifRegulatorAktif = (tariffs: RentalTariff[]) =>
  tariffs.find(t => t.kind === 'REGULATOR' && t.isActive);

export interface RekapRegulator {
  /** Rupiah dari menyewakan regulator bekas. */
  sewa: number;
  /** Rupiah dari menjual regulator baru. */
  jual: number;
  total: number;
  unitSewa: number;
  unitJual: number;
}

/**
 * Berapa unit regulator pada satu baris transaksi.
 *
 * regulatorQty baru ada sejak regulator disederhanakan jadi angka stok. Baris yang
 * lebih tua hanya punya nominalnya, dan saat itu satu baris memang tidak pernah
 * lebih dari satu unit -- jadi 1 adalah nilai yang benar untuknya, bukan tebakan.
 */
const unitRegulator = (t: Transaction) => Number(t.regulatorQty) || 1;

/**
 * Pendapatan regulator, dipisah antara yang disewakan dan yang dijual putus.
 *
 * Disaring dengan barisPendapatan, predikat yang sama dengan kartu Pemasukan: angka
 * ini disajikan sebagai "di antaranya", jadi ia tidak boleh pernah melebihi total
 * yang sedang dipecahnya. Baris yang tidak terhitung sebagai pemasukan -- misalnya
 * regulator yang dipinjamkan tanpa biaya -- memang tidak punya rupiah untuk dihitung.
 *
 * Dua bentuk baris ikut terbaca. Yang lama menempelkan nominal regulator pada baris
 * tabungnya; yang baru mencatatnya sebagai baris tersendiri. Keduanya menyimpan
 * regulatorFee dan regulatorSalePrice di kolom yang sama, jadi penjumlahannya tidak
 * perlu tahu bedanya.
 */
export function rekapPendapatanRegulator(transactions: Transaction[]): RekapRegulator {
  const rekap: RekapRegulator = { sewa: 0, jual: 0, total: 0, unitSewa: 0, unitJual: 0 };

  for (const t of transactions) {
    if (!barisPendapatan(t)) continue;

    const sewa = Number(t.regulatorFee) || 0;
    const jual = Number(t.regulatorSalePrice) || 0;

    if (sewa > 0) {
      rekap.sewa += sewa;
      rekap.unitSewa += unitRegulator(t);
    }
    if (jual > 0) {
      rekap.jual += jual;
      rekap.unitJual += unitRegulator(t);
    }
  }

  rekap.total = rekap.sewa + rekap.jual;
  return rekap;
}

/**
 * Sebutan pendek untuk sisi regulator sebuah baris, atau null kalau barisnya memang
 * tidak menyangkut regulator.
 */
function frasaRegulator(t: Transaction): string | null {
  if (!t.regulatorTariffId) return null;

  const sewa = Number(t.regulatorFee) || 0;
  const jual = Number(t.regulatorSalePrice) || 0;
  const unit = unitRegulator(t);

  // Pengembalian tidak bernominal, tapi tetap perlu disebut -- tanpa ini baris
  // RETURN regulator kelihatan seperti baris kosong tak berjenis.
  if (t.type === 'RETURN') return `regulator kembali ${unit} unit`;

  if (sewa > 0 && jual > 0) return `sewa ${unit} + beli ${unit} regulator`;
  if (sewa > 0) return `sewa regulator ${unit} unit`;
  if (jual > 0) return `beli regulator ${unit} unit`;
  return null;
}

/** Baris yang isinya cuma regulator: tanpa tabung berkode dan tanpa botol. */
const regulatorMurni = (t: Transaction) => Boolean(t.regulatorTariffId) && !t.cylinderId && !t.size;

export interface DetailBaris {
  utama: string;
  /** Baris kecil di bawahnya; null kalau tidak ada yang perlu ditambahkan. */
  catatan: string | null;
}

/**
 * Isi kolom "Detail Item" satu baris laporan.
 *
 * Regulator bisa muncul dalam dua bentuk, dan keduanya harus terbaca. Kalau barisnya
 * memang cuma regulator, itulah barangnya dan disebut sebagai judul. Kalau regulator
 * menempel pada baris tabung -- bentuk lama, dan masih ada di riwayat -- tabungnya
 * tetap jadi judul dan regulatornya jadi keterangan di bawahnya.
 *
 * Tanpa ini, angka di kartu "Pendapatan Regulator" berhenti sebagai total yang harus
 * dipercaya begitu saja: tidak ada satu pun baris di layar yang menyebut regulator.
 */
/**
 * Kalimat pembuka untuk satu baris RENTAL_OUT: "Menyewakan ..." atau "Menjual ...".
 *
 * Regulator yang dijual putus juga tercatat sebagai RENTAL_OUT -- jenis itu memang
 * menampung semua barang yang keluar bersama pelanggan. Menyebutnya "menyewakan"
 * bukan sekadar salah kata: barang yang sudah dijual tidak akan pernah ditagih
 * kembali, dan riwayat yang mengatakan sebaliknya menyesatkan orang yang membacanya
 * setahun kemudian.
 */
export function frasaKeluar(t: Transaction, serialCode?: string): string {
  const kerja = regulatorMurni(t) && (Number(t.regulatorSalePrice) || 0) > 0 ? 'Menjual' : 'Menyewakan';
  return `${kerja} ${sebutanBarang(t, serialCode)}`;
}

export function detailBaris(t: Transaction, serialCode?: string): DetailBaris {
  const frasa = frasaRegulator(t);

  if (frasa && regulatorMurni(t)) {
    return { utama: frasa.charAt(0).toUpperCase() + frasa.slice(1), catatan: null };
  }
  return {
    utama: sebutanBarang(t, serialCode),
    catatan: frasa ? `+ ${frasa}` : null,
  };
}
