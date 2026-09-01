import { Cylinder, CylinderSize, GasType, PenukaranTabung, RefillPrice, Transaction } from '../types';

/**
 * Perkiraan biaya isi ulang ke pabrik.
 *
 * Halaman Pabrik sudah tahu berapa seharusnya sebuah batch dibayar -- daftar harga
 * vendor ada di refill_prices, dan tab Pengiriman memang sudah menampilkannya sebagai
 * "Perkiraan Biaya". Yang tidak ada sebelumnya adalah angka itu di tab TERIMA KEMBALI,
 * justru di tempat nominalnya diketik. Akibatnya nyata: batch 28 Agustus 2026 berisi 20
 * tabung dengan perkiraan Rp 1.383.000 tercatat sebagai Rp 199.000, dan tidak ada satu
 * pun tanda di layar bahwa angkanya meleset sejuta lebih.
 *
 * Perkiraan ini penuntun, bukan penghalang. Nota pabrik memang bisa berbeda dari daftar
 * harga -- ada susut, ada tabung yang ditolak, ada harga yang berubah dan belum
 * diperbarui. Karena itu selisih hanya diperingatkan, tidak pernah menolak simpanan.
 */

/** Sekadar yang dibutuhkan untuk mencocokkan harga; Cylinder memenuhinya apa adanya. */
export interface TabungDihargai {
  serialCode: string;
  gasType: GasType;
  size: CylinderSize;
}

/**
 * Harga vendor yang paling cocok untuk satu tabung.
 *
 * Satu vendor bisa punya beberapa harga untuk gas dan ukuran yang sama, dibedakan kode
 * SKU-nya (misalnya "YK" Rp 40.000 dan "M" Rp 62.000 di Merak). Yang menyebut SKU
 * menang atas yang umum, dan SKU yang lebih panjang menang atas yang lebih pendek --
 * aturan yang lebih khusus selalu lebih benar daripada aturan yang lebih longgar.
 */
export function hargaVendorTabung(tabung: TabungDihargai, harga: RefillPrice[]): RefillPrice | null {
  const cocok = harga.filter(p =>
    p.gasType === tabung.gasType &&
    p.size === tabung.size &&
    (!p.serialCode || tabung.serialCode.toUpperCase().includes(p.serialCode.toUpperCase()))
  );

  if (cocok.length === 0) return null;

  return [...cocok].sort((a, b) => {
    const skuA = a.serialCode || '';
    const skuB = b.serialCode || '';
    if (skuA && !skuB) return -1;
    if (!skuA && skuB) return 1;
    return skuB.length - skuA.length;
  })[0];
}

/**
 * Vendor yang terakhir dikirimi tabung ini.
 *
 * Dibaca dari baris REFILL_OUT, bukan dari cylinders.lastLocation: kolom itu menyimpan
 * NAMA vendor, dan nama bisa sama atau berubah, sedangkan refillStationId menunjuk
 * barisnya. Tabung yang sedang diisi pasti punya baris ini -- handleSendToRefill selalu
 * menulisnya bersamaan dengan perubahan statusnya.
 */
export function vendorTerakhir(transactions: Transaction[], cylinderId: string): string | undefined {
  let terakhir: Transaction | undefined;

  for (const t of transactions) {
    if (t.type !== 'REFILL_OUT' || t.cylinderId !== cylinderId) continue;
    if (!terakhir || new Date(t.date).getTime() > new Date(terakhir.date).getTime()) {
      terakhir = t;
    }
  }

  return terakhir?.refillStationId;
}

export interface PerkiraanTerima {
  /** Jumlah rupiah dari tabung yang harganya ketemu. */
  total: number;
  jumlahBerharga: number;
  /** Tabung yang vendornya atau harganya tidak ketemu -- tidak ikut menambah total. */
  jumlahTanpaHarga: number;
  /**
   * Harga vendor tiap tabung, siap ditempelkan ke baris REFILL_IN-nya masing-masing.
   *
   * Kuncinya id tabung yang pulang apa adanya, ATAU lamaId untuk yang ditukar pabrik --
   * tabung pengganti belum tentu punya id saat perkiraan dihitung, dan sebuah tabung
   * tidak pernah muncul di kedua kelompok sekaligus, jadi satu peta cukup.
   *
   * Yang harganya tidak ketemu tidak ada di sini sama sekali; pemanggil menganggapnya
   * nol. Selisihnya tertampung di baris penyeimbang, bukan disamarkan jadi rata-rata.
   */
  hargaPerTabung: Map<string, number>;
}

/**
 * Berapa seharusnya batch penerimaan ini dibayar.
 *
 * Yang dihitung adalah tabung yang MASUK gudang: yang pulang apa adanya ditambah tabung
 * pengganti. Vendor tiap tabung dicari sendiri-sendiri, karena satu penerimaan boleh
 * memuat tabung dari dua pengiriman yang berbeda vendor -- tab Terima Kembali tidak
 * pernah meminta petugas memilih vendor.
 *
 * Tabung pengganti dihargai menurut vendor yang dikirimi tabung LAMA-nya: penukaran
 * terjadi di pabrik itu, dan yang ditagih adalah pabrik itu juga.
 */
export function perkiraanBiayaTerima(
  idDiterima: string[],
  penukaran: PenukaranTabung[],
  cylinders: Cylinder[],
  transactions: Transaction[],
  refillPrices: RefillPrice[]
): PerkiraanTerima {
  let total = 0;
  let jumlahBerharga = 0;
  let jumlahTanpaHarga = 0;
  const hargaPerTabung = new Map<string, number>();

  const hitung = (kunci: string, tabung: TabungDihargai | undefined, vendorId: string | undefined) => {
    const harga = tabung && vendorId
      ? hargaVendorTabung(tabung, refillPrices.filter(p => p.stationId === vendorId))
      : null;

    if (!harga) {
      jumlahTanpaHarga++;
      return;
    }

    const nilai = Number(harga.price) || 0;
    hargaPerTabung.set(kunci, nilai);
    total += nilai;
    jumlahBerharga++;
  };

  for (const id of idDiterima) {
    hitung(id, cylinders.find(c => c.id === id), vendorTerakhir(transactions, id));
  }

  for (const p of penukaran) {
    const terdaftar = p.penggantiId ? cylinders.find(c => c.id === p.penggantiId) : undefined;
    hitung(p.lamaId, p.pengganti ?? terdaftar, vendorTerakhir(transactions, p.lamaId));
  }

  return { total, jumlahBerharga, jumlahTanpaHarga, hargaPerTabung };
}

export interface RincianBiayaTerima {
  /** Nominal tiap baris REFILL_IN. Kuncinya sama dengan hargaPerTabung. */
  perTabung: Map<string, number>;
  /** Nominal untuk tabung yang tidak disebut perTabung. */
  bawaan: number;
  /**
   * Satu baris penyeimbang, atau null kalau tidak ada selisih. 'kurang-bayar' adalah
   * pengeluaran tambahan, 'kelebihan-bayar' adalah uang yang kembali dari pabrik.
   */
  penyeimbang: { jenis: 'kurang-bayar' | 'kelebihan-bayar'; nominal: number } | null;
}

/**
 * Membagi nominal batch ke baris-barisnya.
 *
 * Tiap tabung dicatat sebesar HARGA VENDORNYA SENDIRI, bukan rata-rata batch. Rata-rata
 * menempelkan angka yang tidak pernah benar ke tabung mana pun -- satu Acetylene
 * Rp 447.000 dan satu Oxygen Rp 40.000 sama-sama tercatat Rp 243.500, dan biaya isi
 * ulang per jenis gas jadi tidak bisa dibaca lagi dari riwayat.
 *
 * Selisih antara yang dibayar dan daftar harga tidak ikut diratakan. Ia berdiri sendiri
 * sebagai satu baris, karena memang bukan biaya tabung tertentu: kurang bayar adalah
 * pengeluaran tambahan ke pabrik, lebih bayar adalah uang yang kembali.
 *
 * Dua keadaan sengaja jatuh kembali ke perilaku lama, karena keduanya berarti tidak ada
 * yang bisa dipercaya untuk membagi:
 *
 * - Nominal kosong. Membagi harga vendor ke tiap tabung lalu menyeimbangkannya dengan
 *   "uang kembali" sebesar seluruh perkiraan akan melahirkan sepasang baris karangan
 *   senilai jutaan dari petugas yang cuma lupa mengisi kolom.
 * - Tidak satu pun tabung punya harga vendor. Tanpa acuan, bagi rata justru tebakan
 *   terbaik yang ada, dan satu baris gelondongan tidak menerangkan apa-apa.
 */
export function rincianBiayaTerima(
  diketik: number,
  jumlahDiterima: number,
  perkiraan: PerkiraanTerima
): RincianBiayaTerima {
  const kosong = new Map<string, number>();

  if (diketik <= 0) {
    return { perTabung: kosong, bawaan: 0, penyeimbang: null };
  }

  if (perkiraan.jumlahBerharga === 0) {
    return {
      perTabung: kosong,
      bawaan: jumlahDiterima > 0 ? diketik / jumlahDiterima : 0,
      penyeimbang: null,
    };
  }

  const selisih = diketik - perkiraan.total;

  return {
    perTabung: perkiraan.hargaPerTabung,
    bawaan: 0,
    penyeimbang: selisih === 0 ? null : {
      jenis: selisih > 0 ? 'kurang-bayar' : 'kelebihan-bayar',
      nominal: Math.abs(selisih),
    },
  };
}

/**
 * Seberapa jauh nominal boleh meleset dari daftar harga sebelum layar bersuara.
 *
 * Seperlima dipilih supaya selisih yang biasa -- susut, ongkos angkut, harga yang naik
 * sedikit -- lewat tanpa bunyi, sementara salah ketik yang sesungguhnya (harga satuan
 * masuk ke kolom total, nol yang kurang) selalu tertangkap.
 */
export const BATAS_SELISIH_WAJAR = 0.2;

export type StatusBiayaTerima = 'kosong' | 'tanpa-acuan' | 'meleset' | 'wajar';

export interface PemeriksaanBiaya {
  status: StatusBiayaTerima;
  perkiraan: PerkiraanTerima;
  /** Nominal yang diketik dibagi rata -- persis yang akan tersimpan di tiap baris. */
  perUnit: number;
  /** Positif berarti bayar lebih besar dari daftar harga. */
  selisih: number;
  /** Besar selisih relatif terhadap perkiraan, 0.5 berarti meleset separuh. */
  rasio: number;
}

/**
 * Membandingkan nominal yang diketik dengan daftar harga vendor.
 *
 * 'kosong' didahulukan atas segalanya: batch bernominal nol adalah pengeluaran yang
 * hilang dari laporan, dan itu terjadi berkali-kali (22 Agustus dan 1 September 2026).
 *
 * Perkiraan yang tidak lengkap tetap dibandingkan. Perkiraan yang kekurangan beberapa
 * tabung selalu LEBIH KECIL dari biaya sebenarnya, jadi nominal yang masih di bawahnya
 * pun sudah pasti keliru -- justru kasus yang paling ingin ditangkap. Kelengkapannya
 * disebutkan di layar lewat jumlahTanpaHarga supaya petugas tahu angkanya belum utuh.
 */
export function periksaBiayaTerima(
  diketik: number,
  jumlahDiterima: number,
  perkiraan: PerkiraanTerima
): PemeriksaanBiaya {
  const perUnit = jumlahDiterima > 0 ? diketik / jumlahDiterima : 0;
  const selisih = diketik - perkiraan.total;
  const rasio = perkiraan.total > 0 ? Math.abs(selisih) / perkiraan.total : 0;

  const status: StatusBiayaTerima =
    diketik <= 0 ? 'kosong'
      : perkiraan.jumlahBerharga === 0 ? 'tanpa-acuan'
        : rasio > BATAS_SELISIH_WAJAR ? 'meleset'
          : 'wajar';

  return { status, perkiraan, perUnit, selisih, rasio };
}
