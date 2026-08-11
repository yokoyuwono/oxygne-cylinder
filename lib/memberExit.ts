import { Cylinder, RentalTariff, Transaction } from '../types';
import { BulkHolding, hitungHoldingCurah, hitungHoldingRegulator } from './bulkStock';

/**
 * Syarat pelanggan keluar.
 *
 * Di lapangan keluarnya pelanggan bukan satu klik: seluruh barang toko harus
 * kembali dulu, lalu deposit ditahan 14 hari sebelum boleh dicairkan -- jeda itu
 * yang menutup tagihan atau tabung susulan yang baru ketahuan belakangan.
 *
 * Berkas ini menyatukan dua pemeriksaan itu supaya layar mana pun yang memakainya
 * memberi jawaban yang sama.
 */

/** Lama deposit ditahan setelah pengajuan keluar, sebelum boleh dicairkan. */
export const HARI_MASA_TUNGGU = 14;

const SEHARI_MS = 1000 * 60 * 60 * 24;

export interface RegulatorHolding {
  tariffId: string;
  nama: string;
  qty: number;
}

export interface RingkasanHolding {
  tabungBerkode: Cylinder[];
  curah: BulkHolding[];
  regulator: RegulatorHolding[];
  /** Jumlah seluruh barang yang masih tercatat di tangan pelanggan. */
  totalBarang: number;
}

/**
 * Seluruh barang toko yang masih dipegang seorang pelanggan, dari ketiga jalur
 * pencatatan sekaligus: tabung berkode (kolom currentHolder), botol curah dan
 * regulator sewaan (keduanya diturunkan dari riwayat transaksi).
 *
 * Tarif regulator yang sudah tidak aktif tetap ikut dihitung -- regulator yang
 * terlanjur beredar tidak boleh hilang dari daftar hanya karena tarifnya
 * dinonaktifkan.
 */
export function hitungSemuaHolding(
  cylinders: Cylinder[],
  transactions: Transaction[],
  tariffs: RentalTariff[],
  memberId: string | null
): RingkasanHolding {
  if (!memberId) {
    return { tabungBerkode: [], curah: [], regulator: [], totalBarang: 0 };
  }

  const tabungBerkode = cylinders.filter(c => c.currentHolder === memberId);
  const curah = hitungHoldingCurah(transactions, memberId);

  const regulator = tariffs
    .filter(t => t.kind === 'REGULATOR')
    .map(t => ({
      tariffId: t.id,
      nama: t.name || 'Regulator',
      qty: hitungHoldingRegulator(transactions, memberId, t.id),
    }))
    .filter(r => r.qty > 0);

  const totalBarang =
    tabungBerkode.length +
    curah.reduce((n, h) => n + h.qty, 0) +
    regulator.reduce((n, r) => n + r.qty, 0);

  return { tabungBerkode, curah, regulator, totalBarang };
}

export interface StatusMasaTunggu {
  /** Tanggal paling awal deposit boleh dicairkan. */
  tanggalTarget: Date;
  /** Sisa hari menuju tanggal target; nol kalau sudah lewat. */
  sisaHari: number;
  sudahLewat: boolean;
}

/**
 * Posisi pelanggan terhadap masa tunggu, dihitung dari tanggal pengajuan keluar.
 * Tanggal yang tidak bisa dibaca menghasilkan sudahLewat = false, jadi data rusak
 * tidak pernah diam-diam meloloskan pencairan.
 */
export function hitungStatusMasaTunggu(exitRequestDate: string): StatusMasaTunggu {
  const tanggalTarget = new Date(exitRequestDate);
  tanggalTarget.setDate(tanggalTarget.getDate() + HARI_MASA_TUNGGU);

  const sekarang = new Date();
  const sisaMs = tanggalTarget.getTime() - sekarang.getTime();

  return {
    tanggalTarget,
    sisaHari: sisaMs > 0 ? Math.ceil(sisaMs / SEHARI_MS) : 0,
    sudahLewat: sekarang >= tanggalTarget,
  };
}
