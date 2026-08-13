import {
  Cylinder,
  CylinderSize,
  CylinderStatus,
  GasType,
  Member,
  MemberStatus,
  RentalTariff,
  Transaction,
} from '../types';
import { formatIDR } from '../labels';
import { tarifCurahAktif, totalRegulatorBeredar } from './bulkStock';
import { hitungSemuaHolding, hitungStatusMasaTunggu } from './memberExit';

/**
 * Hitungan turunan untuk Beranda.
 *
 * Semuanya fungsi murni atas data yang sudah dimuat App -- Beranda tidak pernah
 * bertanya ke database sendiri. Dipisah ke sini supaya komponennya tinggal
 * merender, dan supaya angka yang sama bisa dipakai layar lain tanpa disalin.
 */

/** Sisa stok siap sewa di bawah angka ini dianggap kritis. */
export const AMBANG_STOK_KRITIS = 2;

/** Tabung yang lebih lama dari ini di pelanggan sudah waktunya ditagih kembali. */
export const AMBANG_SEWA_LAMA = 60;

const SEHARI_MS = 1000 * 60 * 60 * 24;

// ---------------------------------------------------------------- Antrian tindakan

export type NadaTindakan = 'bahaya' | 'peringatan' | 'info';

export interface ItemTindakan {
  id: string;
  ikon: string;
  teks: string;
  detail?: string;
  tujuan: string;
  nada: NadaTindakan;
}

/**
 * Gas yang stok siap sewanya menipis.
 *
 * Hanya gas yang memang ada di armada yang diperiksa. Enum GasType punya 19 nilai
 * sementara toko cuma memegang beberapa, jadi tanpa saringan ini peringatannya
 * menyebut setiap gas yang tidak pernah dimiliki dan jadi tidak ada gunanya.
 */
export function gasStokKritis(cylinders: Cylinder[]): GasType[] {
  const total = new Map<string, number>();
  const tersedia = new Map<string, number>();

  for (const c of cylinders) {
    if (!c.gasType) continue;
    total.set(c.gasType, (total.get(c.gasType) || 0) + 1);
    if (c.status === CylinderStatus.Available) {
      tersedia.set(c.gasType, (tersedia.get(c.gasType) || 0) + 1);
    }
  }

  return Object.values(GasType).filter(
    gas => (total.get(gas) || 0) > 0 && (tersedia.get(gas) || 0) < AMBANG_STOK_KRITIS
  );
}

/**
 * Hal-hal yang menunggu keputusan admin hari ini. Hanya yang benar-benar ada yang
 * dikembalikan, jadi daftar kosong berarti memang tidak ada yang perlu ditindak.
 */
export function hitungAntrianTindakan(
  cylinders: Cylinder[],
  transactions: Transaction[],
  members: Member[],
  tariffs: RentalTariff[]
): ItemTindakan[] {
  const antrian: ItemTindakan[] = [];

  const gasKritis = gasStokKritis(cylinders);
  if (gasKritis.length > 0) {
    antrian.push({
      id: 'stok-kritis',
      ikon: 'warning',
      teks: `Stok siap sewa menipis untuk ${gasKritis.length} jenis gas`,
      detail: gasKritis.join(', '),
      tujuan: '/inventory',
      nada: 'bahaya',
    });
  }

  const menungguKeluar = members.filter(m => m.status === MemberStatus.Pending_Exit);

  const masihPegang = menungguKeluar.filter(
    m => hitungSemuaHolding(cylinders, transactions, tariffs, m.id).totalBarang > 0
  );
  if (masihPegang.length > 0) {
    antrian.push({
      id: 'keluar-masih-pegang',
      ikon: 'inventory_2',
      teks: `${masihPegang.length} pelanggan mengajukan keluar tapi masih memegang barang`,
      detail: masihPegang.map(m => m.companyName).join(', '),
      tujuan: '/members',
      nada: 'bahaya',
    });
  }

  const kosongPerluIsi = cylinders.filter(c => c.status === CylinderStatus.EmptyRefill).length;
  if (kosongPerluIsi > 0) {
    antrian.push({
      id: 'kosong-perlu-isi',
      ikon: 'local_gas_station',
      teks: `${kosongPerluIsi} tabung kosong menunggu dikirim isi ulang`,
      tujuan: '/refill',
      nada: 'peringatan',
    });
  }

  const berbon = members.filter(m => (m.totalDebt || 0) > 0);
  if (berbon.length > 0) {
    const totalBon = berbon.reduce((n, m) => n + (m.totalDebt || 0), 0);
    antrian.push({
      id: 'bon',
      ikon: 'receipt_long',
      teks: `${berbon.length} pelanggan punya bon belum lunas`,
      detail: formatIDR(totalBon),
      tujuan: '/bon',
      nada: 'peringatan',
    });
  }

  const siapCair = menungguKeluar.filter(
    m => m.exitRequestDate && hitungStatusMasaTunggu(m.exitRequestDate).sudahLewat
  );
  if (siapCair.length > 0) {
    antrian.push({
      id: 'deposit-siap-cair',
      ikon: 'savings',
      teks: `${siapCair.length} deposit sudah lewat masa tunggu dan boleh dicairkan`,
      detail: siapCair.map(m => m.companyName).join(', '),
      tujuan: '/members',
      nada: 'info',
    });
  }

  return antrian;
}

// ------------------------------------------------------------------- Kesiapan stok

export interface StokCurah {
  size: CylinderSize;
  gasType?: GasType;
  qty: number;
}

export interface StokRegulator {
  nama: string;
  tersediaSewa: number;
  stokBaru: number;
  sedangDisewa: number;
}

export interface KesiapanStok {
  siapSewa: number;
  kosongPerluIsi: number;
  diVendor: number;
  dalamPengiriman: number;
  curah: StokCurah[];
  regulator: StokRegulator[];
}

/**
 * Apa yang bisa dilayani kalau ada pelanggan datang sekarang.
 *
 * Botol curah memakai stockQty dari tarif -- angka kepemilikan yang sudah berkurang
 * saat botol pergi dan bertambah saat kembali, jadi tidak perlu diturunkan lagi dari
 * transaksi. Regulator sebaliknya: unit yang beredar hanya ada di riwayat.
 */
export function hitungKesiapanStok(
  cylinders: Cylinder[],
  transactions: Transaction[],
  tariffs: RentalTariff[]
): KesiapanStok {
  let siapSewa = 0;
  let kosongPerluIsi = 0;
  let diVendor = 0;
  let dalamPengiriman = 0;

  for (const c of cylinders) {
    if (c.status === CylinderStatus.Available) siapSewa++;
    else if (c.status === CylinderStatus.EmptyRefill) kosongPerluIsi++;
    else if (c.status === CylinderStatus.Refilling) diVendor++;
    else if (c.status === CylinderStatus.Delivery) dalamPengiriman++;
  }

  const curah = tarifCurahAktif(tariffs)
    .map(t => ({ size: t.size as CylinderSize, gasType: t.gasType, qty: t.stockQty || 0 }))
    .filter(s => Boolean(s.size));

  const regulator = tariffs
    .filter(t => t.kind === 'REGULATOR' && t.isActive)
    .map(t => {
      const sedangDisewa = totalRegulatorBeredar(transactions, t.id);
      return {
        nama: t.name || 'Regulator',
        tersediaSewa: Math.max(0, (t.regulatorUsedStock || 0) - sedangDisewa),
        stokBaru: t.regulatorNewStock || 0,
        sedangDisewa,
      };
    });

  return { siapSewa, kosongPerluIsi, diVendor, dalamPengiriman, curah, regulator };
}

// -------------------------------------------------------------- Tabung di pelanggan

export interface BarisSewaTerlama {
  cylinderId: string;
  serialCode: string;
  gasType?: GasType;
  namaPelanggan: string;
  tanggalSewa: string;
  hari: number;
}

export interface RingkasanSewa {
  totalDisewa: number;
  lewatAmbang: number;
  ambangHari: number;
  terlama: BarisSewaTerlama[];
}

/**
 * Tabung yang sedang di tangan pelanggan, diurut dari yang paling lama belum kembali.
 *
 * Lama sewa dihitung dari RENTAL_OUT terakhir milik tabung itu. Tanggal acuan diambil
 * sekali di awal supaya seluruh baris dibandingkan terhadap saat yang sama.
 */
export function hitungSewaTerlama(
  cylinders: Cylinder[],
  transactions: Transaction[],
  members: Member[],
  ambangHari = AMBANG_SEWA_LAMA,
  batasBaris = 5
): RingkasanSewa {
  const sewaTerakhir = new Map<string, number>();
  for (const t of transactions) {
    if (t.type !== 'RENTAL_OUT' || !t.cylinderId) continue;
    const waktu = new Date(t.date).getTime();
    const tersimpan = sewaTerakhir.get(t.cylinderId);
    if (tersimpan === undefined || waktu > tersimpan) sewaTerakhir.set(t.cylinderId, waktu);
  }

  const namaPer = new Map(members.map(m => [m.id, m.companyName]));
  const sekarang = Date.now();

  const disewa = cylinders.filter(c => c.status === CylinderStatus.Rented);
  const baris: BarisSewaTerlama[] = [];

  for (const c of disewa) {
    const mulai = sewaTerakhir.get(c.id);
    if (mulai === undefined) continue;
    baris.push({
      cylinderId: c.id,
      serialCode: c.serialCode,
      gasType: c.gasType,
      namaPelanggan: namaPer.get(c.currentHolder || '') || 'Tidak diketahui',
      tanggalSewa: new Date(mulai).toISOString(),
      hari: Math.floor((sekarang - mulai) / SEHARI_MS),
    });
  }

  baris.sort((a, b) => b.hari - a.hari);

  return {
    totalDisewa: disewa.length,
    lewatAmbang: baris.filter(b => b.hari > ambangHari).length,
    ambangHari,
    terlama: baris.slice(0, batasBaris),
  };
}

// ---------------------------------------------------------------------------- Bon

export interface RingkasanBon {
  total: number;
  pelanggan: { id: string; nama: string; jumlah: number }[];
}

/**
 * Bon pelanggan, diambil dari members.totalDebt.
 *
 * Sengaja bukan dari transaksi berstatus UNPAID: pembayaran utang menurunkan
 * totalDebt tapi tidak pernah menandai transaksinya lunas, jadi daftar UNPAID hanya
 * bertambah dan menggelembungkan angkanya. totalDebt yang terpelihara.
 */
export function hitungBon(members: Member[], batasBaris = 5): RingkasanBon {
  const berbon = members
    .filter(m => (m.totalDebt || 0) > 0)
    .sort((a, b) => (b.totalDebt || 0) - (a.totalDebt || 0));

  return {
    total: berbon.reduce((n, m) => n + (m.totalDebt || 0), 0),
    pelanggan: berbon.slice(0, batasBaris).map(m => ({
      id: m.id,
      nama: m.companyName,
      jumlah: m.totalDebt || 0,
    })),
  };
}
