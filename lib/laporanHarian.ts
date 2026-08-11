import { Transaction } from '../types';

/**
 * Rekap satu hari.
 *
 * Ini laporan keuangan yang dilihat Operator: satu tanggal saja, bukan rekap
 * menyeluruh. Predikat pendapatan dan pengeluarannya sengaja disamakan dengan yang
 * dipakai halaman Keuangan -- kalau berbeda, angka harian dan rekap Administrator
 * akan berselisih dan tidak ada yang tahu mana yang benar.
 */

/** Tukar isi juga pendapatan; kalau hanya RENTAL_OUT yang dihitung, penjualan gas ke pembeli lepas hilang. */
export const barisPendapatan = (t: Transaction) =>
  (t.type === 'RENTAL_OUT' || t.type === 'GAS_EXCHANGE') && (t.cost || 0) > 0;

/** Biaya isi ulang ke vendor dan belanja operasional harian sama-sama uang keluar. */
export const barisPengeluaran = (t: Transaction) =>
  (t.type === 'REFILL_IN' || t.type === 'EXPENSE') && (t.cost || 0) > 0;

/**
 * Tanggal lokal sebuah transaksi dalam bentuk YYYY-MM-DD, siap dibandingkan dengan
 * nilai <input type="date">.
 *
 * Dibaca sebagai waktu lokal, bukan UTC. Transaksi disimpan sebagai ISO UTC, jadi
 * memotong string tanggalnya begitu saja akan menggeser hari bagi pengguna di zona
 * waktu Indonesia.
 */
export function tanggalLokal(nilai: string | number | Date): string {
  const d = new Date(nilai);
  if (Number.isNaN(d.getTime())) return '';

  const bulan = `${d.getMonth() + 1}`.padStart(2, '0');
  const hari = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${bulan}-${hari}`;
}

/** Hari ini dalam bentuk YYYY-MM-DD lokal -- nilai awal pemilih tanggal. */
export const hariIni = () => tanggalLokal(new Date());

export interface LaporanHarian {
  transaksi: Transaction[];
  pemasukan: number;
  pengeluaran: number;
  jumlahTransaksi: number;
}

/**
 * Seluruh transaksi pada satu tanggal beserta uang masuk dan keluarnya.
 * Daftarnya mencakup semua jenis transaksi, termasuk yang tidak berhubungan dengan
 * uang, supaya laporannya menggambarkan seluruh kegiatan hari itu.
 */
export function hitungLaporanHarian(transactions: Transaction[], tanggal: string): LaporanHarian {
  const transaksi = transactions
    .filter(t => tanggalLokal(t.date) === tanggal)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return {
    transaksi,
    pemasukan: transaksi.filter(barisPendapatan).reduce((n, t) => n + (t.cost || 0), 0),
    pengeluaran: transaksi.filter(barisPengeluaran).reduce((n, t) => n + (t.cost || 0), 0),
    jumlahTransaksi: transaksi.length,
  };
}
