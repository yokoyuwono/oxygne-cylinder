import { Transaction } from '../types';

/**
 * Rekap satu hari.
 *
 * Ini laporan keuangan yang dilihat Operator: satu tanggal saja, bukan rekap
 * menyeluruh. Predikat pendapatan dan pengeluarannya sengaja disamakan dengan yang
 * dipakai halaman Keuangan -- kalau berbeda, angka harian dan rekap Administrator
 * akan berselisih dan tidak ada yang tahu mana yang benar.
 */

/**
 * Tukar isi juga pendapatan; kalau hanya RENTAL_OUT yang dihitung, penjualan gas ke
 * pembeli lepas hilang. INCOME menampung penjualan lepas yang tidak lewat tabung
 * sama sekali -- selang regulator, kran oksigen, dan sejenisnya.
 *
 * ORDER_PAYMENT adalah uang untuk pesanan di Antrian Isi -- penjualan gas yang
 * sungguhan, cuma barangnya diserahkan belakangan. Barisnya bertanggal hari uangnya
 * berpindah, jadi menghitungnya di sini membuat pemasukan tercatat pada hari uang itu
 * benar-benar masuk laci. Baris barang pesanan (RETURN dan RENTAL_OUT bernominal nol)
 * tersaring sendiri oleh syarat cost > 0.
 *
 * Daftar jenis ini tidak boleh disalin ke tempat lain. Rekap per metode bayar dan tab
 * Keuangan memakai ulang predikat ini justru supaya tidak ada dua daftar yang bisa
 * berselisih -- lihat rekapPemasukanPerMetode di lib/metodeBayar.ts.
 */
export const barisPendapatan = (t: Transaction) =>
  (t.type === 'RENTAL_OUT' || t.type === 'GAS_EXCHANGE' || t.type === 'INCOME' ||
   t.type === 'ORDER_PAYMENT') && (t.cost || 0) > 0;

/** Biaya isi ulang ke vendor dan belanja operasional harian sama-sama uang keluar. */
export const barisPengeluaran = (t: Transaction) =>
  (t.type === 'REFILL_IN' || t.type === 'EXPENSE') && (t.cost || 0) > 0;

/**
 * Deposit jaminan: uang yang berpindah, tapi bukan pendapatan.
 *
 * Titipan ini tidak boleh masuk barisPendapatan. Predikat itu memberi makan Laba
 * Bersih di tab Keuangan, dan deposit yang dihitung sebagai laba akan berbalik jadi
 * angka bohong pada hari pelanggan mengambilnya kembali -- laba yang pernah dilaporkan
 * tidak pernah benar-benar jadi milik toko.
 *
 * Tapi uangnya nyata dan hari ini ada di laci. Operator yang menghitung laci pada
 * penutupan hari tidak bisa mencocokkannya dengan laporan yang mengabaikan deposit.
 * Karena itu deposit dihitung sebagai ARUS KAS harian -- terpisah dari pendapatan,
 * dan tidak pernah ikut ke perhitungan laba.
 */
export const depositMasuk = (t: Transaction) =>
  t.type === 'RENTAL_OUT' ? Number(t.depositAmount) || 0 : 0;

/**
 * Deposit yang dikembalikan, dalam dua bentuk yang berbeda kolom.
 *
 * Botol curah yang dikembalikan menuliskan titipannya di depositAmount pada baris
 * RETURN. Pelanggan yang berhenti menyewa menuliskannya di cost pada baris
 * DEPOSIT_REFUND. Keduanya uang yang keluar dari laci hari itu.
 */
export const depositKeluar = (t: Transaction) =>
  t.type === 'RETURN' ? Number(t.depositAmount) || 0
    : t.type === 'DEPOSIT_REFUND' ? Number(t.cost) || 0
    : 0;

/** Rupiah yang benar-benar masuk laci dari satu baris: pendapatan ditambah titipan. */
export const uangMasukBaris = (t: Transaction) =>
  (barisPendapatan(t) ? Number(t.cost) || 0 : 0) + depositMasuk(t);

/** Lawannya: belanja, biaya isi ulang, dan titipan yang dikembalikan. */
export const uangKeluarBaris = (t: Transaction) =>
  (barisPengeluaran(t) ? Number(t.cost) || 0 : 0) + depositKeluar(t);

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
  /** Pendapatan saja -- angka yang sama dengan yang memberi makan Laba Bersih. */
  pemasukan: number;
  pengeluaran: number;
  jumlahTransaksi: number;
  /** Titipan yang diterima dan dikembalikan hari itu. Bukan laba, tapi tetap uang. */
  depositMasuk: number;
  depositKeluar: number;
  /** Yang benar-benar harus cocok dengan isi laci: pendapatan + titipan. */
  uangMasuk: number;
  uangKeluar: number;
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

  const jumlahkan = (f: (t: Transaction) => number) => transaksi.reduce((n, t) => n + f(t), 0);

  const pemasukan = transaksi.filter(barisPendapatan).reduce((n, t) => n + (t.cost || 0), 0);
  const pengeluaran = transaksi.filter(barisPengeluaran).reduce((n, t) => n + (t.cost || 0), 0);
  const masukDeposit = jumlahkan(depositMasuk);
  const keluarDeposit = jumlahkan(depositKeluar);

  return {
    transaksi,
    pemasukan,
    pengeluaran,
    jumlahTransaksi: transaksi.length,
    depositMasuk: masukDeposit,
    depositKeluar: keluarDeposit,
    uangMasuk: pemasukan + masukDeposit,
    uangKeluar: pengeluaran + keluarDeposit,
  };
}
