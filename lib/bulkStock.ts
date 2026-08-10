import { Transaction, RentalTariff, CylinderSize, GasType } from '../types';

/**
 * Perhitungan untuk ukuran tabung yang tidak berkode (stok curah).
 *
 * Botol 1m3 tidak punya kode dan saling gantikan, jadi tidak bisa dilacak sebagai
 * baris cylinders. Yang dilacak adalah jumlahnya: berapa yang dimiliki toko
 * (rental_tariffs.stockQty) dan berapa yang sedang dipegang tiap pelanggan.
 *
 * Jumlah yang dipegang sengaja DITURUNKAN dari transaksi, bukan disimpan sebagai
 * kolom tersendiri. Angka turunan tidak bisa melenceng dari sumbernya, dan seluruh
 * transaksi memang sudah dimuat aplikasi.
 */

export interface BulkHolding {
  size: CylinderSize;
  gasType?: GasType;
  qty: number;
}

/** Baris transaksi curah: tanpa cylinderId, tapi punya jumlah dan ukuran. */
const barisCurah = (t: Transaction) =>
  !t.cylinderId && Boolean(t.size) && Number(t.quantity) > 0;

/**
 * Berapa botol curah yang sedang dipegang seorang pelanggan, per ukuran.
 * Disewa menambah, dikembalikan mengurangi. Ukuran dengan sisa nol dibuang.
 */
export function hitungHoldingCurah(transactions: Transaction[], memberId: string): BulkHolding[] {
  if (!memberId) return [];

  const perUkuran = new Map<string, number>();

  for (const t of transactions) {
    if (t.memberId !== memberId || !barisCurah(t)) continue;
    const qty = Number(t.quantity) || 0;
    const sekarang = perUkuran.get(t.size!) || 0;

    if (t.type === 'RENTAL_OUT') perUkuran.set(t.size!, sekarang + qty);
    else if (t.type === 'RETURN') perUkuran.set(t.size!, sekarang - qty);
  }

  return [...perUkuran.entries()]
    .filter(([, qty]) => qty > 0)
    .map(([size, qty]) => ({ size: size as CylinderSize, qty }));
}

/**
 * Baris transaksi SEWA regulator (bukan jual): punya tarif regulator dan
 * jumlah. Baris jual (regulatorSalePrice) sengaja dikecualikan -- regulator
 * yang terjual jadi milik pelanggan permanen, tidak pernah "beredar sewaan"
 * dan tidak akan pernah dikembalikan.
 */
const barisRegulator = (t: Transaction) =>
  Boolean(t.regulatorTariffId) && Number(t.regulatorQty) > 0 &&
  (t.type === 'RETURN' || t.regulatorFee !== undefined);

/**
 * Berapa unit regulator bekas yang sedang dipegang seorang pelanggan, untuk
 * satu tarif regulator tertentu. Sama prinsipnya dengan hitungHoldingCurah:
 * disewa menambah, dikembalikan mengurangi, diturunkan dari transaksi supaya
 * tidak melenceng dari sumbernya.
 */
export function hitungHoldingRegulator(transactions: Transaction[], memberId: string, regulatorTariffId: string): number {
  if (!memberId || !regulatorTariffId) return 0;

  let qty = 0;
  for (const t of transactions) {
    if (t.memberId !== memberId || t.regulatorTariffId !== regulatorTariffId || !barisRegulator(t)) continue;
    if (t.type === 'RENTAL_OUT' || t.type === 'DELIVERY') qty += Number(t.regulatorQty) || 0;
    else if (t.type === 'RETURN') qty -= Number(t.regulatorQty) || 0;
  }
  return Math.max(0, qty);
}

/**
 * Berapa unit regulator bekas dari satu tarif yang sedang beredar (dipegang
 * pelanggan mana pun). Dipakai Master Data untuk menghitung "Tersedia Sewa".
 */
export function totalRegulatorBeredar(transactions: Transaction[], regulatorTariffId: string): number {
  if (!regulatorTariffId) return 0;

  let qty = 0;
  for (const t of transactions) {
    if (t.regulatorTariffId !== regulatorTariffId || !barisRegulator(t)) continue;
    if (t.type === 'RENTAL_OUT' || t.type === 'DELIVERY') qty += Number(t.regulatorQty) || 0;
    else if (t.type === 'RETURN') qty -= Number(t.regulatorQty) || 0;
  }
  return Math.max(0, qty);
}

/**
 * Sebutan barang pada satu transaksi.
 *
 * Tabung berkode disebut lewat kode serinya. Baris curah tidak punya kode -- kalau
 * dipaksa memakai serialCode hasilnya "undefined", jadi disebut lewat jumlah dan
 * ukurannya.
 */
export function sebutanBarang(t: Transaction, serialCode?: string): string {
  if (serialCode) return serialCode;
  if (t.quantity && t.size) return `${t.quantity} botol ${t.size}`;
  return 'operasi batch';
}

/** Tarif untuk ukuran tanpa kode yang sedang aktif -- yang boleh muncul di form. */
export const tarifCurahAktif = (tariffs: RentalTariff[]) =>
  tariffs.filter(t => t.kind === 'CYLINDER' && t.isActive && !t.isCoded);

/** Tarif berkode yang aktif -- dipakai alur aset per unit. */
export const tarifBerkodeAktif = (tariffs: RentalTariff[]) =>
  tariffs.filter(t => t.kind === 'CYLINDER' && t.isActive && t.isCoded);

export const cariTarifCurah = (tariffs: RentalTariff[], gasType?: string, size?: string) =>
  tariffs.find(t => t.kind === 'CYLINDER' && !t.isCoded && t.gasType === gasType && t.size === size);
