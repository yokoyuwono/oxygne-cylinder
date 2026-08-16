import { CylinderSize, GasOrder, GasType, Member } from '../types';
import { tanggalLokal } from './laporanHarian';

/**
 * Turunan untuk halaman Antrian Isi.
 *
 * Semua perhitungannya di sini, bukan di komponen, dengan alasan yang sama seperti
 * lib/bon.ts: yang perlu diperiksa saat angkanya terasa salah adalah satu berkas
 * tanpa JSX, bukan komponen sepanjang layar.
 *
 * Tidak ada satu pun fungsi di sini yang menjumlahkan GasOrder.harga. Nominal yang
 * sah cuma ada di baris ORDER_PAYMENT di transactions -- harga di pesanan adalah
 * taksiran yang boleh berubah selama belum dibayar.
 */

export const JENIS_PESANAN: Record<string, string> = {
  TITIP_ISI: 'Titip Isi',
  TUKAR_BESAR: 'Tukar Besar',
  TUKAR_KECIL: 'Tukar Kecil',
};

export const STATUS_PESANAN: Record<string, string> = {
  MENUNGGU: 'Menunggu Isi',
  SELESAI: 'Sudah Diserahkan',
  BATAL: 'Dibatalkan',
};

/**
 * Pesanan yang menginap lebih dari seminggu ditandai di layar dan diangkat ke Beranda.
 *
 * Seminggu karena itu jarak wajar satu putaran ke pabrik dan kembali. Yang melewatinya
 * berarti bukan sedang menunggu isi, tapi terlupakan -- dan pelanggan biasanya sudah
 * menagih duluan sebelum toko sadar sendiri.
 */
export const AMBANG_PESANAN_LAMA = 7;

export interface BarisAntrian {
  pesanan: GasOrder;
  /** Uangnya sudah berpindah atau sudah dicatat sebagai bon. */
  sudahBayar: boolean;
  /** Umur pesanan dalam hari, dihitung dari tanggal masuk. */
  umurHari: number;
  /** Nama usaha kalau pelanggan terdaftar, kalau tidak nama yang dicatat petugas. */
  nama: string;
  /** Sebutan barangnya untuk kartu -- tabung berkode, botol curah, atau tabung titipan. */
  ringkasBarang: string;
}

export interface RingkasanAntrian {
  menunggu: BarisAntrian[];
  selesai: BarisAntrian[];
  batal: BarisAntrian[];
  jumlahMenunggu: number;
  /** Pesanan menunggu yang uangnya belum berpindah sama sekali. */
  belumBayar: number;
  /** Pesanan menunggu yang umurnya melewati AMBANG_PESANAN_LAMA. */
  lewatAmbang: number;
}

/**
 * Selisih hari lewat tanggal lokal, bukan pengurangan milidetik mentah.
 *
 * Transaksi dan pesanan disimpan sebagai ISO UTC. Menghitung selisihnya langsung
 * membuat pesanan yang masuk sore hari sudah "berumur satu hari" sebelum tengah malam
 * di Jakarta, karena harinya sudah berganti di UTC.
 */
const umurHari = (dari: string, sekarang: Date): number => {
  const masuk = tanggalLokal(dari);
  const kini = tanggalLokal(sekarang);
  if (!masuk || !kini) return 0;

  const selisih = Date.parse(`${kini}T00:00:00`) - Date.parse(`${masuk}T00:00:00`);
  return Math.max(0, Math.round(selisih / 86_400_000));
};

/**
 * Sebutan barang sebuah pesanan.
 *
 * Tabung titipan disebut lewat kode seri yang dicatat petugas -- itu satu-satunya
 * penanda yang dipunyainya, karena tabungnya memang tidak pernah terdaftar. Tukar
 * besar disebut lewat kode seri tabung yang masuk. Tukar kecil tidak punya kode sama
 * sekali, jadi disebut lewat jumlah dan ukurannya, sama seperti sebutanBarang di
 * lib/bulkStock.ts.
 */
function sebutanPesanan(p: GasOrder, kodeMasuk?: string): string {
  const gas = p.gasType ? ` ${p.gasType}` : '';

  if (p.jenis === 'TITIP_ISI') {
    const kode = (p.serialTitipan || '').trim();
    return kode ? `Tabung titipan ${kode}` : `Tabung titipan${gas || ' pelanggan'}`;
  }

  if (p.jenis === 'TUKAR_BESAR') {
    return kodeMasuk ? `${kodeMasuk}${gas}` : `Tabung besar${gas}`;
  }

  const ukuran = p.size ? ` ${p.size}` : '';
  return `${p.quantity || 1} botol${gas}${ukuran}`;
}

/**
 * Seluruh pesanan dikelompokkan per status, siap dirender.
 *
 * `kodeTabung` dipisah dari `members` supaya modul ini tidak perlu tahu bentuk
 * Cylinder -- pemanggilnya cukup menyerahkan peta id ke kode seri.
 */
export function daftarAntrian(
  orders: GasOrder[],
  members: Member[],
  kodeTabung: Map<string, string> = new Map(),
  sekarang: Date = new Date()
): RingkasanAntrian {
  const petaMember = new Map(members.map(m => [m.id, m]));

  const keBaris = (pesanan: GasOrder): BarisAntrian => {
    const member = pesanan.memberId ? petaMember.get(pesanan.memberId) : undefined;

    return {
      pesanan,
      sudahBayar: Boolean(pesanan.transaksiBayarId),
      umurHari: umurHari(pesanan.tanggalMasuk, sekarang),
      nama: member?.companyName || pesanan.namaPembeli || 'Pembeli Lepas',
      ringkasBarang: sebutanPesanan(
        pesanan,
        pesanan.cylinderMasukId ? kodeTabung.get(pesanan.cylinderMasukId) : undefined
      ),
    };
  };

  const menunggu: BarisAntrian[] = [];
  const selesai: BarisAntrian[] = [];
  const batal: BarisAntrian[] = [];

  for (const pesanan of orders) {
    const baris = keBaris(pesanan);

    if (pesanan.status === 'SELESAI') selesai.push(baris);
    else if (pesanan.status === 'BATAL') batal.push(baris);
    else menunggu.push(baris);
  }

  // Yang menunggu paling lama di atas: itu yang paling mungkin sudah ditagih
  // pelanggannya. Riwayat sebaliknya -- yang terbaru dulu, seperti daftar lain.
  menunggu.sort((a, b) => b.umurHari - a.umurHari);

  const terbaruDulu = (a: BarisAntrian, b: BarisAntrian) =>
    new Date(b.pesanan.tanggalSelesai || b.pesanan.tanggalMasuk).getTime() -
    new Date(a.pesanan.tanggalSelesai || a.pesanan.tanggalMasuk).getTime();

  selesai.sort(terbaruDulu);
  batal.sort(terbaruDulu);

  return {
    menunggu,
    selesai,
    batal,
    jumlahMenunggu: menunggu.length,
    belumBayar: menunggu.filter(b => !b.sudahBayar).length,
    lewatAmbang: menunggu.filter(b => b.umurHari >= AMBANG_PESANAN_LAMA).length,
  };
}

/**
 * Pesanan seorang pelanggan yang isinya belum diserahkan.
 *
 * Dipakai saat ia mengajukan keluar. Ini bukan barang toko di tangan pelanggan --
 * justru kebalikannya, toko yang berutang isi -- jadi sengaja TIDAK dijumlahkan ke
 * dalam RingkasanHolding. Antara tabung kosongnya masuk dan isinya diserahkan,
 * hitungan barang di tangan pelanggan memang berkurang, dan tanpa pemeriksaan ini ia
 * bisa keluar dengan bersih padahal masih punya hak yang belum ditunaikan.
 */
export function pesananTertunda(orders: GasOrder[], memberId: string): GasOrder[] {
  if (!memberId) return [];
  return orders.filter(o => o.memberId === memberId && o.status === 'MENUNGGU');
}

/**
 * Pesanan yang sudah menginap melewati ambang.
 *
 * Dipisah dari daftarAntrian supaya Beranda tidak perlu membawa daftar pelanggan dan
 * peta kode tabung hanya untuk menghitung berapa yang telantar.
 */
export function pesananLama(orders: GasOrder[], sekarang: Date = new Date()): GasOrder[] {
  return orders.filter(
    o => o.status === 'MENUNGGU' && umurHari(o.tanggalMasuk, sekarang) >= AMBANG_PESANAN_LAMA
  );
}

/** Pesanan yang menunggu untuk satu jenis gas dan ukuran -- dipakai saat stok datang. */
export function pesananMenunggu(
  orders: GasOrder[],
  gasType?: GasType,
  size?: CylinderSize
): GasOrder[] {
  return orders.filter(
    o =>
      o.status === 'MENUNGGU' &&
      (!gasType || o.gasType === gasType) &&
      (!size || o.size === size)
  );
}
