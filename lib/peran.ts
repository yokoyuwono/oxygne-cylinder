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
