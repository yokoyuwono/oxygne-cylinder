import {
  Cylinder, CylinderStatus, Member, MemberPrice, MetodeBayar, PengirimanMenunggu, RefillPrice, RentalTariff, Transaction,
} from '../types';
import { labelStatusTabung } from '../labels';
import { perkiraanBiayaTerima } from './isiUlang';

/**
 * Laporan Pengiriman: tabung yang diantar ke pelanggan, dicatat dalam dua tahap.
 *
 * Siang hari petugas hanya sempat menuliskan pelanggan, jumlah, dan harga -- nomor
 * tabungnya baru diketahui dan diketik malam hari saat toko tutup. Karena itu catatan
 * siang disimpan sebagai PengirimanMenunggu (bukan transaksi), dan baru malam harinya,
 * ketika nomornya lengkap, ditulis menjadi transaksi dan perubahan status tabung.
 *
 * Tabung yang diantar boleh masih di pabrik. Toko sering menitipkan tabung untuk diisi
 * lalu langsung mengantarnya begitu selesai, tanpa singgah di gudang sebagai Available.
 * Tabung seperti itu dicatat dua kali pada tanggal laporan: REFILL_IN (diterima dari
 * pabrik, ada biaya isinya) lalu RENTAL_OUT (keluar ke pelanggan). Status melompat
 * Refilling -> Rented, dan riwayat tabungnya tetap utuh.
 */

/** Bon tidak berpindah uang, jadi bukan metode bayar -- hanya cara mencatat satu baris. */
export type CaraBayarPengiriman = MetodeBayar | 'BON';

export const STATUS_BISA_DIKIRIM: string[] = [CylinderStatus.Available, CylinderStatus.Refilling];

export const KETERANGAN_PENGIRIMAN = 'Laporan Pengiriman';
export const KETERANGAN_ISI_LANGSUNG_KIRIM = 'Langsung dikirim ke pelanggan';

/** Jenis gas dan ukuran yang paling sering dikirim; bawaan di form siang. */
export const JENIS_BAWAAN = { gasType: 'Oxygen', size: '6m3' } as const;

export const tabungDiPabrik = (tabung: Cylinder) => tabung.status === CylinderStatus.Refilling;

export interface JenisTabung {
  gasType: string;
  size: string;
}

/**
 * Jenis yang bisa dikirim: tarif tabung aktif yang berkode. Ukuran tanpa kode (isCoded
 * false) tidak ikut -- botolnya saling gantikan dan dicatat lewat jumlah di Sewa Baru.
 */
export function jenisTersedia(tariffs: RentalTariff[]): JenisTabung[] {
  return tariffs
    .filter(t => t.kind === 'CYLINDER' && t.isActive && t.isCoded !== false && t.gasType && t.size)
    .map(t => ({ gasType: t.gasType as string, size: t.size as string }));
}

/** Jenis awal sebuah baris: Oxygen 6m3 bila ada, kalau tidak yang pertama. */
export function jenisAwal(tersedia: JenisTabung[]): JenisTabung {
  return tersedia.find(j => j.gasType === JENIS_BAWAAN.gasType && j.size === JENIS_BAWAAN.size)
    ?? tersedia[0]
    ?? { gasType: JENIS_BAWAAN.gasType, size: JENIS_BAWAAN.size };
}

/**
 * Tabung yang boleh masuk laporan: tersedia di gudang atau masih di pabrik.
 *
 * Ukuran tanpa kode dikeluarkan walau barisnya ada di cylinders, sama seperti di Sewa Baru.
 */
export function tabungBisaDikirim(cylinders: Cylinder[], tariffs: RentalTariff[]): Cylinder[] {
  const tanpaKode = (c: Cylinder) =>
    tariffs.find(t => t.kind === 'CYLINDER' && t.gasType === c.gasType && t.size === c.size)?.isCoded === false;

  return cylinders.filter(c => STATUS_BISA_DIKIRIM.includes(c.status) && !tanpaKode(c));
}

/**
 * Saran kode tabung. Yang diawali kata kunci didahulukan, karena kode diketik dari depan.
 * `jenis` menyaring ke gas dan ukuran baris yang sedang diisi.
 */
export function cariTabung(
  daftar: Cylinder[],
  kataKunci: string,
  idTerpakai: string[],
  jenis?: JenisTabung,
  batas = 8
): Cylinder[] {
  const q = kataKunci.trim().toLowerCase();
  if (!q) return [];

  return daftar
    .filter(c => !idTerpakai.includes(c.id))
    .filter(c => !jenis || (c.gasType === jenis.gasType && c.size === jenis.size))
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
 * Harga gas per tabung untuk satu pelanggan.
 *
 * Harga tetap pelanggan (member_prices) menang atas tarif aktif. Biaya sewa dan deposit
 * tidak ikut: yang diantar di laporan ini pelanggan yang sudah berjalan, sama seperti
 * kasir pelanggan lama.
 *
 * Dihitung dari jenis gas dan ukuran, bukan dari tabung -- siang hari tabungnya belum ada.
 */
export function hargaPengiriman(
  jenis: JenisTabung,
  memberId: string,
  memberPrices: MemberPrice[],
  tariffs: RentalTariff[]
): HargaPengiriman {
  const khusus = memberPrices.find(
    p => p.memberId === memberId && p.gasType === jenis.gasType && p.size === jenis.size
  );
  if (khusus) return { harga: Number(khusus.price) || 0, sumber: 'PELANGGAN' };

  const tarif = tariffs.find(
    t => t.kind === 'CYLINDER' && t.isActive && t.gasType === jenis.gasType && t.size === jenis.size
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

// ---------------------------------------------------------------------------
// Tahap 1 -- siang: catat pelanggan, jumlah, harga
// ---------------------------------------------------------------------------

/** Isian satu baris di form siang. Pelanggan baru terisi setelah dipilih dari saran. */
export interface BarisCatat {
  member: Member | null;
  gasType: string;
  size: string;
  jumlah: number;
  harga: number;
  caraBayar: CaraBayarPengiriman;
}

/** Pesan kesalahan untuk isian siang, atau null kalau boleh disimpan. */
export function periksaCatatan(tanggal: string, baris: BarisCatat[]): string | null {
  if (!tanggal) return 'Tanggal laporan wajib diisi.';
  if (baris.length === 0) return 'Isi minimal satu baris pengiriman.';

  for (let i = 0; i < baris.length; i++) {
    if (!baris[i].member) return `Baris ${i + 1}: pilih nama pelanggan dari saran.`;
    if (!(baris[i].jumlah >= 1)) return `Baris ${i + 1}: jumlah tabung minimal 1.`;
  }
  return null;
}

/** Ubah isian siang yang sudah lolos periksaCatatan menjadi baris daftar tunggu. */
export function susunMenunggu(
  tanggal: string,
  baris: BarisCatat[],
  oleh: string | undefined,
  idDasar = Date.now()
): PengirimanMenunggu[] {
  return baris.map((b, idx) => ({
    id: `pk-${idDasar}-${idx}`,
    tanggal,
    memberId: (b.member as Member).id,
    gasType: b.gasType as PengirimanMenunggu['gasType'],
    size: b.size as PengirimanMenunggu['size'],
    jumlah: b.jumlah,
    harga: b.harga,
    caraBayar: b.caraBayar,
    status: 'MENUNGGU',
    createdBy: oleh,
  }));
}

// ---------------------------------------------------------------------------
// Tahap 2 -- malam: isi nomor tabung
// ---------------------------------------------------------------------------

/** Pecah ketikan atau tempelan menjadi kode: dipisah spasi, koma, titik koma, atau baris baru. */
export function uraiKode(teks: string): string[] {
  const unik = new Set<string>();
  for (const token of teks.split(/[\s,;]+/)) {
    const kode = token.trim().toUpperCase();
    if (kode) unik.add(kode);
  }
  return [...unik];
}

export type HasilKode = { tabung: Cylinder } | { galat: string };

/**
 * Cocokkan satu kode yang diketik dengan tabung untuk baris tertentu.
 *
 * Pencocokan persis pada kode seri, tidak peka huruf besar. Galatnya berbahasa
 * Indonesia dan menyebut sebabnya, karena petugas mengetik malam hari dari catatan
 * kertas dan perlu tahu apakah salah ketik atau memang tabung itu tidak bisa dikirim.
 */
export function cocokkanKode(
  kode: string,
  cylinders: Cylinder[],
  jenis: JenisTabung,
  idTerpakai: string[]
): HasilKode {
  const q = kode.trim().toUpperCase();
  const cocok = cylinders.filter(c => c.serialCode.toUpperCase() === q);
  if (cocok.length === 0) return { galat: `${q}: tidak ditemukan.` };

  // Kode ganda di data lama: yang masih bisa dikirim didahulukan.
  const tabung = cocok.find(c => STATUS_BISA_DIKIRIM.includes(c.status)) ?? cocok[0];

  if (tabung.gasType !== jenis.gasType || tabung.size !== jenis.size) {
    return { galat: `${q}: ${tabung.gasType} ${tabung.size}, bukan ${jenis.gasType} ${jenis.size}.` };
  }
  if (!STATUS_BISA_DIKIRIM.includes(tabung.status)) {
    return { galat: `${q}: berstatus ${labelStatusTabung(tabung.status)}, tidak bisa dikirim.` };
  }
  if (idTerpakai.includes(tabung.id)) {
    return { galat: `${q}: sudah dipakai di baris lain.` };
  }
  return { tabung };
}

/** Satu catatan menunggu beserta tabung yang sudah dipilih malam ini. */
export interface PenyelesaianPengiriman {
  menunggu: PengirimanMenunggu;
  member: Member;
  tabung: Cylinder[];
  /** Biaya isi pabrik per id tabung; hanya bermakna untuk tabung yang masih di pabrik. */
  biayaIsi: Record<string, number>;
}

/** Selesai hanya bila jumlah kode persis sama dengan jumlah tabung yang dicatat siang. */
export const kodeLengkap = (p: { menunggu: PengirimanMenunggu; tabung: Cylinder[] }) =>
  p.tabung.length === p.menunggu.jumlah;

/** Satu tabung yang dikirim, siap ditulis menjadi transaksi. */
export interface BarisPengiriman {
  tabung: Cylinder;
  member: Member;
  tanggal: string;
  caraBayar: CaraBayarPengiriman;
  harga: number;
  biayaIsi: number;
}

/** Satu catatan dengan N kode menjadi N baris, masing-masing berharga per tabung. */
export const ubahKeBaris = (penyelesaian: PenyelesaianPengiriman[]): BarisPengiriman[] =>
  penyelesaian.flatMap(p =>
    p.tabung.map(t => ({
      tabung: t,
      member: p.member,
      tanggal: p.menunggu.tanggal,
      caraBayar: p.menunggu.caraBayar,
      harga: p.menunggu.harga,
      biayaIsi: p.biayaIsi[t.id] ?? 0,
    }))
  );

export interface PengirimanPerPelanggan {
  member: Member;
  tanggal: string;
  tabungIds: string[];
  /** Jumlah harga baris yang dicatat Bon; ini yang menambah utang pelanggan. */
  totalBon: number;
}

export interface SusunanPengiriman {
  transaksi: Transaction[];
  /** Per pelanggan dan tanggal: heldSince tiap tabung mengikuti tanggal laporannya sendiri. */
  perPelanggan: PengirimanPerPelanggan[];
}

/**
 * Baris transaksi dan pengelompokan pembaruan tabung untuk baris-baris yang diselesaikan.
 *
 * Nominal RENTAL_OUT hanya berisi harga gas: sewa dan deposit nol, jadi uang titipan
 * tidak tersentuh dan lib/laporanHarian.ts menghitungnya sebagai pendapatan biasa.
 * REFILL_IN dibuat hanya untuk tabung yang masih di pabrik, dengan tanggal laporan yang
 * sama -- tabung itu memang baru "diterima" pada hari ia diantar.
 */
export function susunPengiriman(baris: BarisPengiriman[], idDasar = Date.now()): SusunanPengiriman {
  const transaksi: Transaction[] = [];
  const kelompok = new Map<string, PengirimanPerPelanggan>();

  baris.forEach((b, idx) => {
    const bon = b.caraBayar === 'BON';

    if (tabungDiPabrik(b.tabung)) {
      transaksi.push({
        id: `t-ref-in-${idDasar}-${b.tabung.id}`,
        cylinderId: b.tabung.id,
        type: 'REFILL_IN',
        date: b.tanggal,
        cost: b.biayaIsi,
        description: KETERANGAN_ISI_LANGSUNG_KIRIM,
      });
    }

    transaksi.push({
      id: `t-kirim-${idDasar}-${idx}`,
      cylinderId: b.tabung.id,
      memberId: b.member.id,
      type: 'RENTAL_OUT',
      date: b.tanggal,
      cost: b.harga,
      paymentStatus: bon ? 'UNPAID' : 'PAID',
      paymentMethod: bon ? undefined : (b.caraBayar as MetodeBayar),
      depositAmount: 0,
      rentalFee: 0,
      gasPrice: b.harga,
      quantity: 1,
      size: b.tabung.size,
      description: KETERANGAN_PENGIRIMAN,
    });

    const kunci = `${b.member.id}|${b.tanggal}`;
    const grup = kelompok.get(kunci) ?? { member: b.member, tanggal: b.tanggal, tabungIds: [], totalBon: 0 };
    grup.tabungIds.push(b.tabung.id);
    if (bon) grup.totalBon += b.harga;
    kelompok.set(kunci, grup);
  });

  return { transaksi, perPelanggan: [...kelompok.values()] };
}
