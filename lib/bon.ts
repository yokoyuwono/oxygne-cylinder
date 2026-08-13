import { Member, Transaction } from '../types';

/**
 * Daftar pelanggan yang masih berbon, beserta bahan yang dibutuhkan untuk menagih.
 *
 * Sisa bon diambil dari members.totalDebt, bukan dari menjumlahkan transaksi
 * berstatus UNPAID. Alasannya sama dengan yang tertulis di hitungBon (lib/beranda.ts):
 * cicilan menurunkan totalDebt tapi tidak bisa ditunjuk melunasi tagihan yang mana,
 * sehingga baris UNPAID hanya bertambah dan angkanya menggelembung.
 *
 * Baris UNPAID tetap dibaca di sini, tapi hanya untuk dua hal yang tidak bisa
 * dijawab totalDebt: sejak kapan pelanggan ini berbon, dan tagihan mana saja yang
 * jadi asal-usulnya. Keduanya yang ditanyakan lebih dulu saat menagih.
 */

export interface BarisBon {
  member: Member;
  /** Sisa yang masih harus dibayar hari ini. */
  sisa: number;
  /** Tagihan yang belum pernah ditandai lunas -- asal-usul bon, urut dari yang terlama. */
  tagihan: Transaction[];
  /** Tanggal tagihan tertua yang belum lunas; kosong kalau bonnya tidak punya jejak transaksi. */
  sejak?: string;
  /** Umur bon dalam hari, dihitung dari `sejak`. Kosong kalau `sejak` kosong. */
  umurHari?: number;
  /** Cicilan yang sudah masuk, terbaru lebih dulu. */
  cicilan: Transaction[];
  /** Jumlah seluruh cicilan yang pernah masuk. */
  totalDibayar: number;
}

export interface RingkasanDaftarBon {
  baris: BarisBon[];
  total: number;
  /** Bon yang umurnya melewati AMBANG_MENUNGGAK hari. */
  jumlahMenunggak: number;
}

/**
 * Bon yang lewat sebulan dianggap menunggak dan ditandai di layar.
 *
 * Sebulan karena siklus pemakaian tabung memang bulanan -- pelanggan yang masih
 * memakai gasnya wajar belum bayar, yang sudah berganti bulan berarti terlewat.
 */
export const AMBANG_MENUNGGAK = 30;

const hariAntara = (dari: string, sampai: Date) =>
  Math.max(0, Math.floor((sampai.getTime() - new Date(dari).getTime()) / 86_400_000));

/** Urutan tampilan daftar bon. */
export type UrutanBon = 'terbesar' | 'terlama' | 'nama';

export function daftarBon(
  members: Member[],
  transactions: Transaction[],
  sekarang: Date = new Date()
): RingkasanDaftarBon {
  const berbon = members.filter(m => (m.totalDebt || 0) > 0);
  const idBerbon = new Set(berbon.map(m => m.id));

  // Sekali lewat untuk seluruh transaksi, bukan satu penyaringan per pelanggan.
  // Daftar bon dibuka bersama ribuan baris transaksi di memori, dan menyaring
  // ulang untuk tiap pelanggan membuat halamannya tersendat saat pelanggan berbon
  // bertambah banyak.
  const tagihanPer = new Map<string, Transaction[]>();
  const cicilanPer = new Map<string, Transaction[]>();

  for (const t of transactions) {
    if (!t.memberId || !idBerbon.has(t.memberId)) continue;

    if (t.type === 'DEBT_PAYMENT') {
      const daftar = cicilanPer.get(t.memberId) || [];
      daftar.push(t);
      cicilanPer.set(t.memberId, daftar);
    } else if (t.paymentStatus === 'UNPAID' && (t.cost || 0) > 0) {
      const daftar = tagihanPer.get(t.memberId) || [];
      daftar.push(t);
      tagihanPer.set(t.memberId, daftar);
    }
  }

  const baris: BarisBon[] = berbon.map(member => {
    const tagihan = (tagihanPer.get(member.id) || [])
      .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const cicilan = (cicilanPer.get(member.id) || [])
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const sejak = tagihan[0]?.date;

    return {
      member,
      sisa: member.totalDebt || 0,
      tagihan,
      sejak,
      umurHari: sejak ? hariAntara(sejak, sekarang) : undefined,
      cicilan,
      totalDibayar: cicilan.reduce((n, t) => n + (t.cost || 0), 0),
    };
  });

  return {
    baris,
    total: baris.reduce((n, b) => n + b.sisa, 0),
    jumlahMenunggak: baris.filter(b => (b.umurHari ?? 0) >= AMBANG_MENUNGGAK).length,
  };
}

/** Saringan kata kunci: nama pemilik, nama usaha, atau nomor telepon. */
export function saringBon(baris: BarisBon[], kataKunci: string): BarisBon[] {
  const kunci = kataKunci.trim().toLowerCase();
  if (!kunci) return baris;

  return baris.filter(b =>
    [b.member.name, b.member.companyName, b.member.phone]
      .some(nilai => (nilai || '').toLowerCase().includes(kunci))
  );
}

export function urutkanBon(baris: BarisBon[], urutan: UrutanBon): BarisBon[] {
  const salinan = [...baris];

  switch (urutan) {
    case 'terlama':
      // Bon tanpa jejak transaksi ditaruh paling belakang: umurnya tidak diketahui,
      // jadi menempatkannya di antara yang tertua cuma menipu urutannya.
      return salinan.sort((a, b) => (b.umurHari ?? -1) - (a.umurHari ?? -1));
    case 'nama':
      return salinan.sort((a, b) => a.member.companyName.localeCompare(b.member.companyName));
    default:
      return salinan.sort((a, b) => b.sisa - a.sisa);
  }
}
