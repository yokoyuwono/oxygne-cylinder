import { Cylinder, CylinderStatus, Member, MemberPrice, MetodeBayar, RefillPrice, RentalTariff, Transaction } from '../types';
import { perkiraanBiayaTerima } from './isiUlang';

/**
 * Laporan Pengiriman: tabung yang diantar ke pelanggan dan dicatat sekaligus untuk satu
 * tanggal.
 *
 * Yang membedakannya dari sewa kasir adalah tabungnya boleh masih di pabrik. Toko sering
 * menitipkan tabung untuk diisi lalu langsung mengantarnya begitu selesai, tanpa pernah
 * singgah di gudang sebagai Available. Tabung seperti itu dicatat dua kali pada tanggal
 * laporan: REFILL_IN (diterima dari pabrik, ada biaya isinya) lalu RENTAL_OUT (keluar ke
 * pelanggan). Status melompat Refilling -> Rented, dan riwayat tabungnya tetap utuh.
 */

/** Bon tidak berpindah uang, jadi bukan metode bayar -- hanya cara mencatat satu laporan. */
export type CaraBayarPengiriman = MetodeBayar | 'BON';

/** Isian satu baris di form. Tabung dan pelanggan baru terisi setelah dipilih dari saran. */
export interface BarisDraf {
  kunci: string;
  tabung: Cylinder | null;
  member: Member | null;
  harga: number;
  /**
   * Harga yang diketik petugas tidak boleh tertimpa isian otomatis ketika tabung atau
   * pelanggannya diganti -- ia sudah tahu angka yang dia mau.
   */
  hargaManual: boolean;
  /** Hanya bermakna untuk tabung yang masih di pabrik. */
  biayaIsi: number;
}

/** Baris yang sudah lengkap dan lolos pemeriksaan. */
export interface BarisPengiriman {
  tabung: Cylinder;
  member: Member;
  harga: number;
  biayaIsi: number;
}

export interface LaporanPengirimanPayload {
  /** YYYY-MM-DD, tanggal lokal. */
  tanggal: string;
  baris: BarisPengiriman[];
  caraBayar: CaraBayarPengiriman;
}

export const STATUS_BISA_DIKIRIM: string[] = [CylinderStatus.Available, CylinderStatus.Refilling];

export const KETERANGAN_PENGIRIMAN = 'Laporan Pengiriman';
export const KETERANGAN_ISI_LANGSUNG_KIRIM = 'Langsung dikirim ke pelanggan';

export const tabungDiPabrik = (tabung: Cylinder) => tabung.status === CylinderStatus.Refilling;

/**
 * Tabung yang boleh masuk laporan: tersedia di gudang atau masih di pabrik.
 *
 * Ukuran tanpa kode (tarif isCoded false) dikeluarkan walau barisnya ada di cylinders --
 * botolnya saling gantikan dan dicatat lewat jumlah, bukan lewat kode.
 */
export function tabungBisaDikirim(cylinders: Cylinder[], tariffs: RentalTariff[]): Cylinder[] {
  const tanpaKode = (c: Cylinder) =>
    tariffs.find(t => t.kind === 'CYLINDER' && t.gasType === c.gasType && t.size === c.size)?.isCoded === false;

  return cylinders.filter(c => STATUS_BISA_DIKIRIM.includes(c.status) && !tanpaKode(c));
}

/** Saran kode tabung. Yang diawali kata kunci didahulukan, karena kode diketik dari depan. */
export function cariTabung(daftar: Cylinder[], kataKunci: string, idTerpakai: string[], batas = 8): Cylinder[] {
  const q = kataKunci.trim().toLowerCase();
  if (!q) return [];

  return daftar
    .filter(c => !idTerpakai.includes(c.id))
    .filter(c => c.serialCode.toLowerCase().includes(q) || (c.gasType || '').toLowerCase().includes(q))
    .sort((a, b) => {
      const awalA = a.serialCode.toLowerCase().startsWith(q) ? 0 : 1;
      const awalB = b.serialCode.toLowerCase().startsWith(q) ? 0 : 1;
      return awalA - awalB || a.serialCode.localeCompare(b.serialCode);
    })
    .slice(0, batas);
}

export function cariPelanggan(members: Member[], kataKunci: string, batas = 8): Member[] {
  const q = kataKunci.trim().toLowerCase();
  if (!q) return [];

  return members
    .filter(m => (m.companyName || '').toLowerCase().includes(q) || (m.name || '').toLowerCase().includes(q))
    .slice(0, batas);
}

export interface HargaPengiriman {
  harga: number;
  /** null berarti tidak ada harga pelanggan maupun tarif aktif -- petugas mengisinya sendiri. */
  sumber: 'PELANGGAN' | 'TARIF' | null;
}

/**
 * Harga gas satu tabung untuk satu pelanggan.
 *
 * Harga tetap pelanggan (member_prices) menang atas tarif aktif. Biaya sewa dan deposit
 * tidak ikut: yang diantar di laporan ini pelanggan yang sudah berjalan, sama seperti
 * kasir pelanggan lama.
 */
export function hargaPengiriman(
  tabung: Cylinder,
  memberId: string,
  memberPrices: MemberPrice[],
  tariffs: RentalTariff[]
): HargaPengiriman {
  const khusus = memberPrices.find(
    p => p.memberId === memberId && p.gasType === tabung.gasType && p.size === tabung.size
  );
  if (khusus) return { harga: Number(khusus.price) || 0, sumber: 'PELANGGAN' };

  const tarif = tariffs.find(
    t => t.kind === 'CYLINDER' && t.isActive && t.gasType === tabung.gasType && t.size === tabung.size
  );
  if (tarif) return { harga: Number(tarif.gasPrice) || 0, sumber: 'TARIF' };

  return { harga: 0, sumber: null };
}

/**
 * Biaya isi di pabrik untuk satu tabung, menurut daftar harga vendor yang terakhir
 * dikirimi tabung itu. Null kalau vendornya atau harganya tidak ketemu; pemanggil
 * menampilkannya sebagai peringatan, bukan diam-diam menganggapnya nol.
 */
export function biayaIsiPabrik(
  tabung: Cylinder,
  transactions: Transaction[],
  refillPrices: RefillPrice[]
): number | null {
  const perkiraan = perkiraanBiayaTerima([tabung.id], [], [tabung], transactions, refillPrices);
  return perkiraan.hargaPerTabung.get(tabung.id) ?? null;
}

/** Pesan kesalahan untuk isian saat ini, atau null kalau boleh disimpan. */
export function periksaBaris(draf: BarisDraf[]): string | null {
  if (draf.length === 0) return 'Isi minimal satu baris pengiriman.';

  const kode = new Set<string>();
  for (let i = 0; i < draf.length; i++) {
    const d = draf[i];
    if (!d.tabung) return `Baris ${i + 1}: pilih kode tabung dari saran.`;
    if (!d.member) return `Baris ${i + 1}: pilih nama pelanggan dari saran.`;
    if (kode.has(d.tabung.id)) return `Tabung ${d.tabung.serialCode} muncul lebih dari satu kali.`;
    kode.add(d.tabung.id);
  }
  return null;
}

/** Ubah isian yang sudah lolos periksaBaris menjadi baris lengkap. */
export const lengkapi = (draf: BarisDraf[]): BarisPengiriman[] =>
  draf.map(d => ({ tabung: d.tabung as Cylinder, member: d.member as Member, harga: d.harga, biayaIsi: d.biayaIsi }));

export interface PengirimanPerPelanggan {
  member: Member;
  tabungIds: string[];
  /** Jumlah harga yang jadi bon bila laporan dicatat sebagai bon. */
  total: number;
}

export interface SusunanPengiriman {
  transaksi: Transaction[];
  perPelanggan: PengirimanPerPelanggan[];
}

/**
 * Baris transaksi dan pengelompokan pembaruan tabung untuk satu laporan.
 *
 * Nominal RENTAL_OUT hanya berisi harga gas: sewa dan deposit nol, jadi uang titipan
 * tidak tersentuh dan lib/laporanHarian.ts menghitungnya sebagai pendapatan biasa.
 * REFILL_IN dibuat hanya untuk tabung yang masih di pabrik, dengan tanggal laporan yang
 * sama -- tabung itu memang baru "diterima" pada hari ia diantar.
 */
export function susunPengiriman(payload: LaporanPengirimanPayload, idDasar = Date.now()): SusunanPengiriman {
  const { tanggal, baris, caraBayar } = payload;
  const bon = caraBayar === 'BON';

  const transaksi: Transaction[] = [];
  const kelompok = new Map<string, PengirimanPerPelanggan>();

  baris.forEach((b, idx) => {
    if (tabungDiPabrik(b.tabung)) {
      transaksi.push({
        id: `t-ref-in-${idDasar}-${b.tabung.id}`,
        cylinderId: b.tabung.id,
        type: 'REFILL_IN',
        date: tanggal,
        cost: b.biayaIsi,
        description: KETERANGAN_ISI_LANGSUNG_KIRIM,
      });
    }

    transaksi.push({
      id: `t-kirim-${idDasar}-${idx}`,
      cylinderId: b.tabung.id,
      memberId: b.member.id,
      type: 'RENTAL_OUT',
      date: tanggal,
      cost: b.harga,
      paymentStatus: bon ? 'UNPAID' : 'PAID',
      paymentMethod: bon ? undefined : (caraBayar as MetodeBayar),
      depositAmount: 0,
      rentalFee: 0,
      gasPrice: b.harga,
      quantity: 1,
      size: b.tabung.size,
      description: KETERANGAN_PENGIRIMAN,
    });

    const grup = kelompok.get(b.member.id) ?? { member: b.member, tabungIds: [], total: 0 };
    grup.tabungIds.push(b.tabung.id);
    grup.total += b.harga;
    kelompok.set(b.member.id, grup);
  });

  return { transaksi, perPelanggan: [...kelompok.values()] };
}
