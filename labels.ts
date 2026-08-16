import { CylinderStatus, MemberStatus, UserRole } from './types';

/**
 * Peta label bahasa Indonesia untuk nilai-nilai yang tersimpan di database.
 *
 * Nilai di kolom seperti cylinders.status dan members.status sengaja dibiarkan
 * berbahasa Inggris supaya perubahan tampilan tidak pernah menuntut migrasi data
 * pada ribuan baris produksi. Terjemahannya dilakukan di sini, saat dirender.
 *
 * Pola ini sudah dipakai kode untuk transactions.type, hanya saja sebelumnya
 * tersebar sebagai switch inline di tiap komponen.
 */

export const STATUS_TABUNG: Record<CylinderStatus, string> = {
  [CylinderStatus.Available]: 'Tersedia',
  [CylinderStatus.Rented]: 'Disewa',
  [CylinderStatus.EmptyRefill]: 'Kosong (Perlu Isi Ulang)',
  [CylinderStatus.Refilling]: 'Sedang Diisi',
  [CylinderStatus.Damaged]: 'Rusak',
  [CylinderStatus.Delivery]: 'Pengiriman',
  [CylinderStatus.Unknown]: 'Tidak Diketahui',
};

export const STATUS_ANGGOTA: Record<MemberStatus, string> = {
  [MemberStatus.Active]: 'Aktif',
  [MemberStatus.Pending_Exit]: 'Menunggu Keluar',
  [MemberStatus.Non_Active]: 'Tidak Aktif',
};

export const JENIS_TRANSAKSI: Record<string, string> = {
  RENTAL_OUT: 'Sewa Keluar',
  RETURN: 'Pengembalian',
  REFILL_OUT: 'Kirim Isi Ulang',
  REFILL_IN: 'Terima Isi Ulang',
  DELIVERY: 'Pengiriman',
  DEBT_PAYMENT: 'Pembayaran Utang',
  // Bon yang dicatat langsung, bukan turunan sewa atau tukar isi -- biasanya
  // tagihan yang sudah berjalan di buku sebelum sistem ini dipakai.
  DEBT_ADD: 'Bon Dicatat',
  DEPOSIT_REFUND: 'Pengembalian Deposit',
  GAS_EXCHANGE: 'Tukar Isi',
  // Tabung yang ditukar pabrik dengan tabung lain -- bukan perpindahan gas, tapi
  // pergantian tabungnya sendiri. Tidak pernah bernominal.
  CYLINDER_SWAP: 'Tukar Tabung Pabrik',
  // Bukan sekadar 'Pengeluaran' -- biaya isi ulang ke vendor juga pengeluaran,
  // dan keduanya berdampingan di daftar riwayat.
  EXPENSE: 'Biaya Operasional',
  // Sejalan dengan itu: sewa dan tukar isi juga pemasukan, jadi labelnya menyebut
  // apa yang membedakannya -- barang yang dijual putus, bukan disewakan.
  INCOME: 'Penjualan Lain',
  // Uang untuk pesanan di Antrian Isi. Disebut "pembayaran", bukan "penjualan",
  // karena tanggalnya belum tentu tanggal barangnya diserahkan -- itu justru
  // seluruh alasan jenis ini ada.
  ORDER_PAYMENT: 'Pembayaran Pesanan',
};

export const STATUS_BAYAR: Record<string, string> = {
  PAID: 'Lunas',
  UNPAID: 'Belum Lunas',
};

/** Cara uangnya berpindah -- bukan status lunasnya, yang ada di STATUS_BAYAR. */
export const METODE_BAYAR: Record<string, string> = {
  CASH: 'Tunai',
  TRANSFER: 'Transfer',
};

export const PERAN_PENGGUNA: Record<UserRole, string> = {
  [UserRole.Admin]: 'Administrator',
  [UserRole.Operator]: 'Operator',
  [UserRole.Viewer]: 'Peninjau',
};

/**
 * Ambil label dari sebuah peta tanpa pernah menghasilkan teks kosong.
 *
 * Data produksi memuat nilai yang tidak ada di enum mana pun: 1.102 tabung
 * berstatus NULL, dan 257 tabung ber-gasType 'Acetyline' (salah eja). Untuk kasus
 * seperti itu nilai aslinya dikembalikan apa adanya supaya tetap terbaca dan
 * masalah datanya kelihatan, bukan disembunyikan jadi sel kosong.
 */
export function label(
  peta: Record<string, string>,
  nilai: string | null | undefined,
  fallback = '-'
): string {
  if (nilai === null || nilai === undefined || nilai === '') return fallback;
  return peta[nilai] ?? nilai;
}

export const labelStatusTabung = (v: string | null | undefined) =>
  label(STATUS_TABUNG, v);

export const labelStatusAnggota = (v: string | null | undefined) =>
  label(STATUS_ANGGOTA, v);

export const labelJenisTransaksi = (v: string | null | undefined) =>
  label(JENIS_TRANSAKSI, v);

export const labelStatusBayar = (v: string | null | undefined) =>
  label(STATUS_BAYAR, v);

export const labelMetodeBayar = (v: string | null | undefined) =>
  label(METODE_BAYAR, v);

export const labelPeran = (v: string | null | undefined) =>
  label(PERAN_PENGGUNA, v);

/** Format tanggal seragam untuk seluruh app. */
export const LOKAL = 'id-ID';

/**
 * Format rupiah seragam. Rumus yang sama sudah disalin di beberapa komponen sebagai
 * formatIDR lokal; yang baru cukup memakai versi ini.
 */
export const formatIDR = (nilai: number) =>
  new Intl.NumberFormat(LOKAL, {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(nilai || 0);

export const formatTanggal = (
  nilai: string | number | Date,
  opsi: Intl.DateTimeFormatOptions = {}
) => new Date(nilai).toLocaleDateString(LOKAL, opsi);

export const formatJam = (nilai: string | number | Date) =>
  new Date(nilai).toLocaleTimeString(LOKAL, { hour: '2-digit', minute: '2-digit' });

export const formatTanggalJam = (nilai: string | number | Date) =>
  new Date(nilai).toLocaleString(LOKAL);
