
export enum GasType {
  Oxygen = 'Oxygen',
  Acetylene = 'Acetylene (C2H2)',
  Argon = 'Argon',
  CO2 = 'CO2',
  Nitrogen = 'Nitrogen',
  Helium = 'Helium',
  Hydrogen = 'Hydrogen',
  LPG = 'LPG',
  Propane = 'Propane',
  Methane = 'Methane',
  Butane = 'Butane',
  MedicalOxygen = 'Medical Oxygen',
  MedicalAir = 'Medical Air',
  NitrousOxide = 'Nitrous Oxide',
  SulfurHexafluoride = 'Sulfur Hexafluoride (SF6)',
  Ammonia = 'Ammonia',
  Chlorine = 'Chlorine',
  Mix = 'Mix Gas',
  Other = 'Other'
}

export enum CylinderStatus {
  Available = 'Available',
  Rented = 'Rented',
  EmptyRefill = 'Empty (Needs Refill)',
  Refilling = 'Refilling',
  Damaged = 'Damaged',
  Delivery = 'Delivery',
  // Tabung yang posisinya tidak diketahui -- warisan pencatatan yang tidak
  // dijalankan. Bukan bagian dari armada yang bisa disewakan, jadi dikecualikan
  // dari perhitungan utilisasi dan stok di Dashboard.
  // Nilainya Inggris seperti status lain; labelnya diterjemahkan di labels.ts.
  Unknown = 'Unknown',
}

export enum CylinderSize {
  Small = '1m3',
  Medium = '2m3',
  Large = '6m3',
}

export enum UserRole {
  Admin = 'admin',
  Operator = 'operator',
  Viewer = 'viewer'
}

export enum MemberStatus {
  Active = 'Active',
  Pending_Exit = 'Pending Exit',
  Non_Active = 'Non Active'
}

export interface AppUser {
  id: string;

  /**
   * Email, sekaligus identitas login -- Login.tsx meneruskannya ke
   * signInWithPassword({ email }). Dulu bernama `username` dan diisi teks bebas
   * dari form Tambah Pengguna, sehingga akun yang dibuat tidak pernah bisa login.
   *
   * Di basis data kolomnya masih bernama profiles.username (diisi trigger
   * handle_new_user dari auth.users.email); pemetaannya di App.tsx.
   */
  email: string;

  /** Hanya untuk mengirim kata sandi awal ke Edge Function; tidak pernah dibaca balik. */
  password?: string;
  name: string;
  role: UserRole;
  lastLogin?: string;
}

export interface Cylinder {
  id: string;
  serialCode: string; // 1-3 letters + 1-5 digits
  gasType: GasType;
  size: CylinderSize;
  status: CylinderStatus;
  currentHolder?: string; // Member ID or 'RefillStation'
  lastLocation: string;
  /**
   * Tanggal (YYYY-MM-DD) tabung mulai dipegang pemegangnya sekarang, bukan riwayat
   * perpindahan -- terisi saat tabung keluar ke pelanggan, kosong lagi saat kembali
   * ke gudang. Isian awalnya dari kolom tanggal di buku opname.
   */
  heldSince?: string | null;
}

export interface Member {
  id: string;
  name: string;
  companyName: string;
  address: string; // Changed from email
  phone: string;
  totalDeposit: number; // Security deposit held
  totalDebt: number; // Outstanding rental debt
  joinDate: string;
  status: MemberStatus;
  exitRequestDate?: string; // Date when they requested to leave
}

export interface RefillStation {
  id: string;
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
}

export interface MemberPrice {
  id: string;
  memberId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number; // Custom rate for this specific combination
}

export interface GasPrice {
  id: string;
  gasType: GasType;
  size: CylinderSize;
  price: number; // Base rate for this specific combination
}

export interface RefillPrice {
  id: string;
  stationId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number; // Cost to refill at this station
  serialCode?: string; // Vendor's code/SKU for this item
}

/**
 * Pilihan tabung yang belum jadi dikirim -- satu draf berjalan per vendor.
 *
 * Isinya niat, bukan kejadian: selama masih draf, status tabung belum berubah dan
 * belum ada baris transactions sama sekali. Isi cylinderIds bisa memuat tabung yang
 * sudah tidak layak kirim lagi (keburu disewa orang, dikirim petugas lain), jadi
 * selalu disaring ulang terhadap keadaan terkini saat dimuat.
 */
export interface RefillDraft {
  stationId: string;
  cylinderIds: string[];
  updatedAt: string;
  updatedBy?: string;
}

/**
 * Satu tabung yang tidak pulang dari pabrik karena ditukar dengan tabung lain.
 *
 * Pabrik kadang mengembalikan tabung yang berbeda dari yang dikirim -- fisiknya
 * ditukar, jadi yang masuk gudang adalah kode seri lain dan kode seri lama tidak
 * akan pernah kembali. Isinya niat petugas saat menyusun penerimaan; baru menjadi
 * perubahan data ketika penerimaan dikonfirmasi.
 */
export interface PenukaranTabung {
  /** Tabung yang dikirim ke pabrik dan tidak kembali. */
  lamaId: string;

  /** Tabung pengganti yang ternyata sudah terdaftar -- catatannya dipakai ulang. */
  penggantiId?: string;

  /** Diisi kalau penggantinya belum ada di database sama sekali. */
  pengganti?: { serialCode: string; gasType: GasType; size: CylinderSize };
}

export interface Transaction {
  id: string;
  cylinderId?: string; // Optional for DEBT_PAYMENT
  memberId?: string;
  refillStationId?: string; // For refill transactions
  type: 'RENTAL_OUT' | 'RETURN' | 'REFILL_OUT' | 'REFILL_IN' | 'DEBT_PAYMENT' | 'DEBT_ADD' | 'DEPOSIT_REFUND' | 'DELIVERY' | 'GAS_EXCHANGE' | 'CYLINDER_SWAP' | 'EXPENSE' | 'INCOME';
  date: string;
  rentalDuration?: number; // Days held (relevant for RETURN type)
  cost?: number; // Revenue only -- rental fee + gas + regulator. Deposit is NOT included.
  paymentStatus?: 'PAID' | 'UNPAID';
  relatedTransactionIds?: string[]; // IDs of transactions paid by this DEBT_PAYMENT

  // Breakdown captured at the moment of the transaction. These are copies, not
  // lookups: editing a tariff later must never rewrite past figures.
  depositAmount?: number;      // Security deposit taken -- a liability, not income
  rentalFee?: number;          // One-off cylinder rental charge
  gasPrice?: number;           // Charge for the gas itself
  regulatorFee?: number;       // Regulator rental charge
  regulatorSalePrice?: number; // Regulator sale price
  regulatorTariffId?: string;  // Which regulator tariff this rental/sale/return refers to
  regulatorQty?: number;       // How many regulator units in this line (rent, sale, or return)

  // Baris stok curah tidak punya cylinderId -- botolnya tidak berkode dan tidak
  // bisa dibedakan satu sama lain, jadi ukurannya disimpan langsung di sini.
  quantity?: number;
  size?: CylinderSize;

  /**
   * Keterangan bebas, untuk baris EXPENSE dan INCOME.
   *
   * Baris lain selalu bisa dijelaskan lewat tabung, pelanggan, atau vendor yang
   * direferensikannya. Belanja operasional dan penjualan lepas tidak punya
   * ketiganya -- yang menjelaskannya cuma kalimat yang diketik admin.
   */
  description?: string;

  /**
   * Penanda pembatalan. Transaksi yang salah catat dibatalkan, bukan dihapus --
   * ini catatan uang orang, jadi jejaknya ditahan.
   *
   * App menyaring baris ber-voidedAt saat memuat data, sehingga seluruh
   * perhitungan stok dan laporan otomatis mengabaikannya tanpa perlu tahu soal
   * pembatalan. Karena itu kolom ini hampir tidak pernah terlihat di komponen.
   */
  voidedAt?: string;
  voidedBy?: string;
  voidReason?: string;
}

/**
 * Master data tarif penyewaan -- harga standar yang bisa diubah lewat halaman
 * Master Data tanpa deploy ulang.
 *
 * Baris CYLINDER memakai gasType + size; baris REGULATOR memakai name. Saat sewa
 * dicatat, nominalnya disalin ke baris transaksi supaya riwayat tidak ikut berubah
 * ketika tarif diperbarui.
 */
export interface RentalTariff {
  id: string;
  kind: 'CYLINDER' | 'REGULATOR';
  name?: string;
  gasType?: GasType;
  size?: CylinderSize;
  depositAmount: number;
  rentalFee: number;
  gasPrice: number;
  salePrice: number;
  isActive: boolean;
  createdAt?: string;

  /**
   * Ukuran ini dilacak per unit (punya kode di tabungnya) atau sebagai stok curah.
   * Tabung 1m3 tidak berkode -- botolnya saling gantikan, jadi tidak bisa
   * diperlakukan sebagai aset bernama.
   */
  isCoded: boolean;

  /**
   * Jumlah botol yang dimiliki toko, hanya berlaku saat isCoded = false.
   *
   * Ini angka KEPEMILIKAN, bukan kesiapan. Tukar isi tidak menggerakkannya sama
   * sekali karena botol masuk satu dan keluar satu; yang menggerakkan hanya botol
   * yang pergi atau kembali permanen.
   */
  stockQty: number;

  /**
   * Stok regulator, hanya berlaku saat kind = 'REGULATOR'. Regulator tidak
   * dilacak per unit -- hanya dua angka kepemilikan.
   *
   * regulatorNewStock berkurang saat terjual (state permanen). regulatorUsedStock
   * TIDAK bergerak saat disewa/dikembalikan -- yang sedang beredar diturunkan dari
   * riwayat transaksi (lihat hitungHoldingRegulator di lib/bulkStock.ts), bukan
   * disimpan sebagai kolom yang diubah manual.
   */
  regulatorNewStock: number;
  regulatorUsedStock: number;
}

// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
