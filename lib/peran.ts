import { UserRole } from '../types';

/**
 * Hak akses per peran.
 *
 * Operator boleh melakukan apa pun yang Administrator lakukan, kecuali dua hal:
 * melihat rekap keuangan menyeluruh, dan mengelola akun pengguna. Batas kedua yang
 * menjaga batas pertama -- tanpa itu Operator tinggal menaikkan perannya sendiri.
 *
 * Kedua predikat sengaja hanya mengenali Admin, jadi peran apa pun selain Admin
 * (termasuk 'viewer' warisan yang sudah dihapus dari pilihan) otomatis diperlakukan
 * sebagai Operator.
 *
 * Catatan: ini pembatasan tampilan, bukan pengamanan data. Policy RLS masih memberi
 * setiap akun yang login akses penuh ke semua tabel, dan App memuat seluruh transaksi
 * ke browser untuk semua peran.
 */

/** Rekap keuangan menyeluruh: total, tren bulanan, laba, peringkat pelanggan. */
export const bolehLihatKeuanganPenuh = (peran?: UserRole) => peran === UserRole.Admin;

/** Tambah, hapus, dan ubah peran akun staf. */
export const bolehKelolaPengguna = (peran?: UserRole) => peran === UserRole.Admin;

/**
 * Jenis transaksi yang punya jalur pembalikan lengkap di batalkan_transaksi().
 *
 * Sisanya sengaja tidak ditawarkan tombolnya: isi ulang, pengiriman, pembayaran
 * utang, dan pengembalian deposit mengubah kolom tersimpan yang pembalikannya belum
 * ditulis, dan membalik separuh lebih berbahaya daripada tidak membalik sama sekali.
 */
export const JENIS_BISA_DIBATALKAN = ['RENTAL_OUT', 'RETURN', 'GAS_EXCHANGE'];

/**
 * Boleh membatalkan transaksi ini?
 *
 * Operator sebatas transaksi hari ini -- salah ketik ketahuan dalam hitungan menit,
 * jadi tidak perlu menunggu siapa pun; membongkar catatan lama urusan lain.
 * Administrator bebas.
 *
 * Ini penjaga tampilan saja. Aturan yang sebenarnya berlaku ada di dalam fungsi
 * batalkan_transaksi() di database, yang memeriksa ulang peran dan tanggalnya.
 */
export const bolehBatalkanTransaksi = (
  peran: UserRole | undefined,
  jenis: string,
  tanggalTransaksi: string,
  tanggalHariIni: string
) => {
  if (!JENIS_BISA_DIBATALKAN.includes(jenis)) return false;
  return peran === UserRole.Admin || tanggalTransaksi === tanggalHariIni;
};
