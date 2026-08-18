import React, { useState, useMemo, useEffect } from 'react';
import { Cylinder, Transaction, Member, RefillStation, GasType, CylinderStatus, UserRole } from '../types';
import { formatIDR, labelJenisTransaksi, labelStatusBayar } from '../labels';
import { sebutanBarang } from '../lib/bulkStock';
import { bolehBatalkanTransaksi, bolehLihatKeuanganPenuh } from '../lib/peran';
import { barisPendapatan, barisPengeluaran, hariIni, hitungLaporanHarian, tanggalLokal } from '../lib/laporanHarian';
import { KATEGORI_PENGELUARAN, PengeluaranPayload, rekapPengeluaranPerKategori } from '../lib/pengeluaran';
import { kelompokMetode, rekapPemasukanPerMetode } from '../lib/metodeBayar';
import { detailBaris, frasaKeluar, rekapPendapatanRegulator } from '../lib/regulator';
import { usePaginasi } from '../lib/usePaginasi';
import Paginasi from './Paginasi';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';

interface ReportsViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
  role?: UserRole;
  onBatalkanTransaksi?: (id: string, alasan: string) => Promise<void>;

  /**
   * Mencatat belanja operasional langsung dari tab Keuangan.
   *
   * Hanya jalur ini yang menanyakan pos belanja; halaman /kas tetap mencatat tanpa
   * pos supaya jalur tercepat Operator tidak bertambah panjang.
   */
  onCatatPengeluaran?: (payload: PengeluaranPayload) => Promise<void>;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Sub-component for individual delivery card with toggle state
const DeliveryManifestCard: React.FC<{ date: string, txs: Transaction[], petaTabung: Map<string, Cylinder> }> = ({ date, txs, petaTabung }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden transition-all">
        <div 
            onClick={() => setIsOpen(!isOpen)}
            className="bg-cyan-50 px-6 py-4 border-b border-cyan-100 flex justify-between items-center cursor-pointer hover:bg-cyan-100/50 transition-colors select-none group"
        >
            <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 text-cyan-700 rounded-lg group-hover:bg-cyan-200 transition-colors">
                    <span className="material-icons">local_shipping</span>
                </div>
                <div>
                    <h3 className="font-bold text-gray-800">Manifes Pengiriman</h3>
                    <p className="text-xs text-cyan-700 font-medium">{new Date(date).toLocaleDateString('id-ID', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className="bg-white text-cyan-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-cyan-100">
                    {txs.length} Item
                </span>
                <button 
                    className={`w-8 h-8 flex items-center justify-center rounded-full bg-white/50 hover:bg-white text-cyan-700 transition-all duration-200 ${isOpen ? 'rotate-180' : ''}`}
                >
                    <span className="material-icons">expand_more</span>
                </button>
            </div>
        </div>
        
        {isOpen && (
            <div className="p-6 animate-fade-in border-t border-gray-100">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {txs.map(t => {
                        const cyl = petaTabung.get(t.cylinderId ?? '');
                        return (
                            <div key={t.id} className="flex items-center gap-3 p-3 rounded-lg border border-gray-100 bg-gray-50/50 hover:bg-white hover:border-cyan-100 transition-colors">
                                <div className="w-10 h-10 rounded bg-white border border-gray-200 flex items-center justify-center font-bold text-xs text-gray-600 font-mono shadow-sm">
                                    {cyl?.gasType.substring(0,3).toUpperCase()}
                                </div>
                                <div>
                                    <p className="font-bold text-sm text-gray-800 font-mono">{cyl?.serialCode || 'Tidak diketahui'}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>{cyl?.size}</span>
                                        {cyl?.status === CylinderStatus.Delivery ? (
                                            <span className="text-cyan-600 font-medium flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> Dalam Perjalanan
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">Terkirim</span>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )}
    </div>
  );
};

const ReportsView: React.FC<ReportsViewProps> = ({ cylinders, transactions, members, stations, role, onBatalkanTransaksi, onCatatPengeluaran }) => {
  // Rekap menyeluruh -- total, tren bulanan, laba, peringkat pelanggan -- hanya untuk
  // Administrator. Peran lain melihat keuangan sehari demi sehari lewat tab Harian.
  const bolehRekapPenuh = bolehLihatKeuanganPenuh(role);

  const [activeTab, setActiveTab] = useState<'inventory' | 'financials' | 'logs' | 'delivery' | 'harian'>(
    bolehRekapPenuh ? 'financials' : 'harian');
  const [tanggalHarian, setTanggalHarian] = useState(hariIni);
  const [logFilter, setLogFilter] = useState('');

  // Kata cari yang sudah mengendap. Menyaring ratusan transaksi terhadap 1.829 tabung
  // dan 1.290 pelanggan terlalu mahal untuk dijalankan di setiap ketukan tombol.
  const [cariMengendap, setCariMengendap] = useState('');
  useEffect(() => {
    const jeda = setTimeout(() => setCariMengendap(logFilter), 150);
    return () => clearTimeout(jeda);
  }, [logFilter]);

  // -- New State for Logs --
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // -- Isian pencatatan pengeluaran (tab Keuangan) --
  const [modalPengeluaran, setModalPengeluaran] = useState(false);
  const [posBaru, setPosBaru] = useState(KATEGORI_PENGELUARAN[0].id);
  const [keteranganBaru, setKeteranganBaru] = useState('');
  const [tanggalBaru, setTanggalBaru] = useState(hariIni);
  const [nominalBaru, setNominalBaru] = useState('');
  const [sedangSimpan, setSedangSimpan] = useState(false);
  const [pesanGagal, setPesanGagal] = useState('');
  const [pesanBerhasil, setPesanBerhasil] = useState('');

  const BARIS_PER_HALAMAN = 25;
  const PENGIRIMAN_PER_HALAMAN = 20;

  // -- Peta pencarian --
  //
  // Sebelumnya tiap baris memanggil cylinders.find()/members.find()/stations.find().
  // Dengan 1.829 tabung dan 1.290 pelanggan itu pemindaian linear per baris, diulang
  // setiap render. Peta dibangun sekali per perubahan data, lalu lookup-nya konstan.
  const petaTabung = useMemo(() => new Map(cylinders.map(c => [c.id, c])), [cylinders]);
  const petaPelanggan = useMemo(() => new Map(members.map(m => [m.id, m])), [members]);
  const petaVendor = useMemo(() => new Map(stations.map(s => [s.id, s])), [stations]);

  // -- Pembatalan transaksi --
  const [akanDibatalkan, setAkanDibatalkan] = useState<Transaction | null>(null);
  const [alasanBatal, setAlasanBatal] = useState('');
  const [sedangBatal, setSedangBatal] = useState(false);
  const [gagalBatal, setGagalBatal] = useState('');

  const hariIniLokal = hariIni();
  const bisaDibatalkan = (t: Transaction) =>
    Boolean(onBatalkanTransaksi) &&
    bolehBatalkanTransaksi(role, t.type, tanggalLokal(t.date), hariIniLokal);

  const bukaBatal = (t: Transaction) => {
    setAkanDibatalkan(t);
    setAlasanBatal('');
    setGagalBatal('');
  };

  const jalankanBatal = async () => {
    if (!akanDibatalkan || !onBatalkanTransaksi) return;

    setGagalBatal('');
    setSedangBatal(true);
    try {
      await onBatalkanTransaksi(akanDibatalkan.id, alasanBatal);
      setAkanDibatalkan(null);
    } catch (err) {
      setGagalBatal(err instanceof Error ? err.message : 'Gagal membatalkan transaksi.');
    } finally {
      setSedangBatal(false);
    }
  };

  // -- Data Processing: Inventory --
  const totalCylinders = cylinders.length;
  const rentedCount = cylinders.filter(c => c.status === CylinderStatus.Rented).length;
  const availableCount = cylinders.filter(c => c.status === CylinderStatus.Available).length;
  const refillCount = cylinders.filter(c => [CylinderStatus.Refilling, CylinderStatus.EmptyRefill].includes(c.status)).length;
  const deliveryCount = cylinders.filter(c => c.status === CylinderStatus.Delivery).length;
  const utilizationRate = totalCylinders ? Math.round((rentedCount / totalCylinders) * 100) : 0;

  const gasDistributionData = Object.values(GasType).map(gas => ({
      name: gas.split(' ')[0], // Short name
      count: cylinders.filter(c => c.gasType === gas).length
  }));

  const statusDistributionData = [
      { name: 'Tersedia', value: availableCount, color: '#22c55e' },
      { name: 'Disewa', value: rentedCount, color: '#6366f1' },
      { name: 'Isi Ulang/Kosong', value: refillCount, color: '#f59e0b' },
      { name: 'Pengiriman', value: deliveryCount, color: '#06b6d4' },
      { name: 'Rusak', value: cylinders.filter(c => c.status === CylinderStatus.Damaged).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // -- Data Processing: Financials --
  //
  // Predikatnya dipinjam dari lib/laporanHarian supaya rekap di halaman ini dan
  // Laporan Harian tidak pernah berselisih: satu jenis baru yang lupa ditambahkan di
  // salah satunya langsung jadi dua angka berbeda tanpa ada yang tahu mana yang benar.
  const incomeTransactions = transactions.filter(barisPendapatan);
  const expenseTransactions = transactions.filter(barisPengeluaran);

  const totalIncome = incomeTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const netProfit = totalIncome - totalExpenses;

  // Pengeluaran dipecah per pos. Memakai predikat yang sama seperti totalExpenses di
  // atas, jadi rinciannya selalu berjumlah persis sama dengan kartunya.
  const rekapPos = useMemo(() => rekapPengeluaranPerKategori(transactions), [transactions]);

  // Regulator bukan pos tersendiri melainkan bagian dari Pemasukan -- disewakan dan
  // dijual berbarengan dengan tabung, jadi rupiahnya sudah ikut terhitung di sana.
  // Yang selama ini tidak ada adalah cara melihat berapa besarnya.
  const rekapRegulator = useMemo(() => rekapPendapatanRegulator(transactions), [transactions]);

  // Monthly Trend Data
  const financialTrendData = useMemo(() => {
    const monthlyData: Record<string, { name: string, Income: number, Expense: number, timestamp: number }> = {};
    
    [...incomeTransactions, ...expenseTransactions].forEach(t => {
        const date = new Date(t.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const name = date.toLocaleDateString('id-ID', { month: 'short', year: 'numeric' });
        
        if (!monthlyData[key]) {
            monthlyData[key] = { name, Income: 0, Expense: 0, timestamp: date.getTime() };
        }
        
        // Saringan yang sama seperti di atas -- kalau dua tempat ini memakai daftar
        // jenis yang berbeda, grafiknya tidak berjumlah sama dengan KPI di sebelahnya.
        if (barisPendapatan(t)) {
            monthlyData[key].Income += (t.cost || 0);
        } else if (barisPengeluaran(t)) {
            monthlyData[key].Expense += (t.cost || 0);
        }
    });

    return Object.values(monthlyData).sort((a, b) => a.timestamp - b.timestamp);
  }, [incomeTransactions, expenseTransactions]);

  // Revenue by Member Data
  const revenueByMemberData = useMemo(() => {
      const memberRevenue: Record<string, number> = {};
      incomeTransactions.forEach(t => {
          if (t.memberId) {
              memberRevenue[t.memberId] = (memberRevenue[t.memberId] || 0) + (t.cost || 0);
          }
      });

      return Object.entries(memberRevenue)
          .map(([id, val]) => ({
              name: members.find(m => m.id === id)?.companyName || 'Tidak diketahui',
              value: val
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5); // Top 5
  }, [incomeTransactions, members]);

  // Combined Financial Activity Feed
  const recentFinancialActivity = [...incomeTransactions, ...expenseTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

  // -- Data Processing: Laporan Harian --
  const laporanHarian = useMemo(
      () => hitungLaporanHarian(transactions, tanggalHarian),
      [transactions, tanggalHarian]);

  // Satu hari biasanya pendek, tapi hari sibuk bisa panjang -- dan komponennya sudah ada.
  const halamanHarian = usePaginasi(laporanHarian.transaksi, BARIS_PER_HALAMAN);

  // Memecah kartu Pemasukan supaya uang di laci bisa dicocokkan dengan yang di rekening.
  const pemasukanPerMetode = useMemo(
      () => rekapPemasukanPerMetode(laporanHarian.transaksi),
      [laporanHarian.transaksi]);

  const regulatorHarian = useMemo(
      () => rekapPendapatanRegulator(laporanHarian.transaksi),
      [laporanHarian.transaksi]);

  // -- Data Processing: Logs --
  //
  // Teks pencarian dibangun sekali dan disimpan, terpisah dari kata carinya. Kalau
  // penyusunannya ikut di dalam saringan, setiap ketikan membangun ulang string untuk
  // seluruh transaksi -- padahal yang berubah cuma kata yang dicari.
  const logsTerurut = useMemo(() => transactions
      .map(t => ({
          t,
          teksCari: [
              t.id,
              t.type,
              petaTabung.get(t.cylinderId ?? '')?.serialCode,
              petaPelanggan.get(t.memberId ?? '')?.companyName,
              petaVendor.get(t.refillStationId ?? '')?.name,
              t.description,
          ].filter(Boolean).join(' ').toLowerCase(),
      }))
      .sort((a, b) => new Date(b.t.date).getTime() - new Date(a.t.date).getTime()),
    [transactions, petaTabung, petaPelanggan, petaVendor]);

  const filteredLogs = useMemo(() => {
      const cari = cariMengendap.trim().toLowerCase();
      return logsTerurut
          .filter(({ t, teksCari }) =>
              (selectedType === 'ALL' || t.type === selectedType) &&
              (!cari || teksCari.includes(cari)))
          .map(({ t }) => t);
  }, [logsTerurut, cariMengendap, selectedType]);

  const halamanLogs = usePaginasi(filteredLogs, BARIS_PER_HALAMAN);

  // -- Data Processing: Delivery --
  //
  // Disaring dari transaksi yang sudah ada di memori. Dulu tab ini menembak Supabase
  // sendiri dengan count: 'exact' setiap pindah halaman -- dua permintaan untuk baris
  // yang sudah ikut terunduh saat login.
  const pengirimanTerurut = useMemo(() => transactions
      .filter(t => t.type === 'DELIVERY')
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [transactions]);

  const halamanPengiriman = usePaginasi(pengirimanTerurut, PENGIRIMAN_PER_HALAMAN);

  const deliveryGroups = useMemo(() => {
    const groups: Record<string, Transaction[]> = {};
    halamanPengiriman.halamanIni.forEach(t => {
        if (!groups[t.date]) groups[t.date] = [];
        groups[t.date].push(t);
    });

    return Object.entries(groups)
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime());
  }, [halamanPengiriman.halamanIni]);

  // tampilkanNominal dilewatkan dari pemanggil: baris REFILL_IN menempelkan biaya ke
  // subtitle, jadi menyembunyikan kolom Jumlah saja tidak cukup menutup nominalnya.
  const getTxDescription = (t: Transaction, tampilkanNominal = true) => {
      const cyl = petaTabung.get(t.cylinderId ?? '');
      const member = petaPelanggan.get(t.memberId ?? '');
      const station = petaVendor.get(t.refillStationId ?? '');
      const code = cyl?.serialCode || 'Tidak diketahui';

      switch(t.type) {
          // sebutanBarang, bukan `code`: baris curah dan regulator tidak punya kode
          // seri, jadi memakai code menghasilkan "Menyewakan Tidak diketahui" --
          // menyesatkan di daftar, dan berbahaya di dialog konfirmasi pembatalan.
          case 'RENTAL_OUT': return { title: frasaKeluar(t, cyl?.serialCode), subtitle: `Ke ${member?.companyName}`, icon: 'shopping_cart', color: 'bg-blue-100 text-blue-600', badge: 'SEWA' };
          case 'RETURN': return { title: `Dikembalikan ${sebutanBarang(t, cyl?.serialCode)}`, subtitle: `Dari ${member?.companyName}`, icon: 'assignment_return', color: 'bg-green-100 text-green-600', badge: 'KEMBALI' };
          case 'REFILL_OUT': return { title: `Kirim Isi Ulang ${code}`, subtitle: `Ke ${station?.name}`, icon: 'local_shipping', color: 'bg-orange-100 text-orange-600', badge: 'KIRIM' };
          case 'REFILL_IN': return { title: `Diterima Kembali ${code}`, subtitle: tampilkanNominal ? `Biaya: ${t.cost ? formatIDR(t.cost) : '-'}` : `Dari ${station?.name || 'isi ulang'}`, icon: 'inventory_2', color: 'bg-indigo-100 text-indigo-600', badge: 'TERIMA' };
          case 'DEBT_PAYMENT': return { title: 'Pembayaran Utang', subtitle: `Dari ${member?.companyName}`, icon: 'payments', color: 'bg-teal-100 text-teal-600', badge: 'BAYAR' };
          case 'DEBT_ADD': return { title: t.description || 'Bon Dicatat', subtitle: `Atas nama ${member?.companyName}`, icon: 'post_add', color: 'bg-amber-100 text-amber-600', badge: 'BON' };
          case 'DEPOSIT_REFUND': return { title: 'Pengembalian Deposit', subtitle: `Ke ${member?.companyName}`, icon: 'savings', color: 'bg-purple-100 text-purple-600', badge: 'REFUND' };
          case 'DELIVERY': return { title: `Pengiriman ${code}`, subtitle: 'Dalam Perjalanan', icon: 'local_shipping', color: 'bg-cyan-100 text-cyan-600', badge: 'ANTAR' };
          case 'GAS_EXCHANGE': return { title: `Tukar Isi ${sebutanBarang(t)}`, subtitle: member ? `Untuk ${member.companyName}` : 'Pembeli lepas', icon: 'swap_horiz', color: 'bg-teal-100 text-teal-600', badge: 'TUKAR' };
          case 'CYLINDER_SWAP': return { title: `Tukar Tabung ${code}`, subtitle: t.description || 'Ditukar pabrik', icon: 'swap_horiz', color: 'bg-amber-100 text-amber-600', badge: 'TUKAR TABUNG' };
          case 'EXPENSE': return { title: t.description || 'Biaya Operasional', subtitle: 'Belanja operasional', icon: 'receipt_long', color: 'bg-rose-100 text-rose-600', badge: 'BIAYA' };
          case 'INCOME': return { title: t.description || 'Penjualan Lain', subtitle: 'Penjualan lepas', icon: 'trending_up', color: 'bg-green-100 text-green-600', badge: 'JUAL' };
          // Barangnya belum tentu keluar pada tanggal ini -- itu justru gunanya jenis
          // ini ada -- jadi subtitle-nya menyebut keadaan pesanannya, bukan tabung.
          case 'ORDER_PAYMENT': return { title: t.description || 'Pembayaran Pesanan', subtitle: t.paymentStatus === 'UNPAID' ? 'Antrian isi, dibon' : 'Antrian isi', icon: 'pending_actions', color: 'bg-violet-100 text-violet-600', badge: 'PESANAN' };
          // Keterangannya sudah memuat nominal, pelanggan, pelaku, dan alasannya --
          // barisnya memang tidak punya isi lain, dan itu yang perlu terbaca utuh.
          case 'DEBT_REMOVED': return { title: t.description || 'Bon Dihapus', subtitle: 'Koreksi salah catat, bukan uang masuk', icon: 'delete_sweep', color: 'bg-slate-100 text-slate-600', badge: 'HAPUS BON' };
          default: return { title: 'Tidak diketahui', subtitle: '', icon: 'help', color: 'bg-gray-100', badge: 'LAIN' };
      }
  };

  const getTypeBadgeClass = (type: string) => {
      switch(type) {
          case 'RENTAL_OUT': return 'bg-blue-100 text-blue-800';
          case 'RETURN': return 'bg-green-100 text-green-800';
          case 'REFILL_OUT': return 'bg-orange-100 text-orange-800';
          case 'REFILL_IN': return 'bg-indigo-100 text-indigo-800';
          case 'DEBT_PAYMENT': return 'bg-teal-100 text-teal-800';
          case 'DEBT_ADD': return 'bg-amber-100 text-amber-800';
          case 'DEPOSIT_REFUND': return 'bg-purple-100 text-purple-800';
          case 'DELIVERY': return 'bg-cyan-100 text-cyan-800';
          case 'GAS_EXCHANGE': return 'bg-teal-100 text-teal-800';
          case 'CYLINDER_SWAP': return 'bg-amber-100 text-amber-800';
          case 'EXPENSE': return 'bg-rose-100 text-rose-800';
          case 'INCOME': return 'bg-green-100 text-green-800';
          case 'ORDER_PAYMENT': return 'bg-violet-100 text-violet-800';
          case 'DEBT_REMOVED': return 'bg-slate-100 text-slate-800';
          default: return 'bg-gray-100 text-gray-800';
      }
  };

  const nominalPengeluaran = Number(nominalBaru) || 0;
  const siapSimpan = keteranganBaru.trim().length > 0 && nominalPengeluaran > 0 && Boolean(tanggalBaru);

  const tutupModalPengeluaran = () => {
    setModalPengeluaran(false);
    setPesanGagal('');
  };

  const simpanPengeluaran = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onCatatPengeluaran || !siapSimpan || sedangSimpan) return;

    setPesanGagal('');
    setSedangSimpan(true);
    try {
      await onCatatPengeluaran({
        description: keteranganBaru.trim(),
        amount: nominalPengeluaran,
        date: new Date(tanggalBaru).toISOString(),
        kategori: posBaru,
      });

      setModalPengeluaran(false);
      setKeteranganBaru('');
      setNominalBaru('');
      setTanggalBaru(hariIni());
      setPesanBerhasil(`Pengeluaran ${formatIDR(nominalPengeluaran)} tercatat.`);
      setTimeout(() => setPesanBerhasil(''), 3500);
    } catch (err) {
      setPesanGagal(err instanceof Error ? err.message : 'Gagal menyimpan pengeluaran.');
    } finally {
      setSedangSimpan(false);
    }
  };

  /** Baris ringkas untuk kartu di HP -- dipakai tabel Riwayat dan Laporan Harian. */
  const BarisKartu: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
      <div className="flex justify-between gap-3 text-sm">
          <span className="text-gray-500 shrink-0">{label}</span>
          <span className="text-gray-800 text-right min-w-0 break-words">{children}</span>
      </div>
  );

  return (
    <div className="space-y-6 pb-20 md:pb-0 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Laporan &amp; Analitik</h2>
           <p className="text-gray-500 text-sm">Kinerja sistem, pelacakan keuangan, dan riwayat aktivitas.</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 w-full md:w-auto overflow-x-auto hide-scrollbar">
            {[
                { id: 'inventory', label: 'Stok & Pemakaian', icon: 'pie_chart' },
                { id: 'delivery', label: 'Laporan Pengiriman', icon: 'local_shipping' },
                { id: 'harian', label: 'Laporan Harian', icon: 'today' },
                // Tabnya disaring di sini, bukan cuma blok rendernya -- kalau hanya
                // bloknya, tombolnya tetap bisa diklik dan halamannya jadi kosong.
                ...(bolehRekapPenuh ? [{ id: 'financials', label: 'Keuangan', icon: 'paid' }] : []),
                { id: 'logs', label: 'Riwayat Aktivitas', icon: 'receipt_long' }
            ].map(tab => (
                <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id as any)}
                    className={`flex-1 md:flex-none px-4 py-2 rounded-md text-sm font-medium transition-all flex items-center justify-center gap-2 whitespace-nowrap ${
                        activeTab === tab.id 
                        ? 'bg-indigo-100 text-indigo-700 shadow-sm' 
                        : 'text-gray-500 hover:text-gray-700'
                    }`}
                >
                    <span className="material-icons text-lg">{tab.icon}</span>
                    {tab.label}
                </button>
            ))}
        </div>
      </div>

      {/* TAB: INVENTORY */}
      {activeTab === 'inventory' && (
        <div className="space-y-6 animate-fade-in">
             {/* KPI Cards */}
             <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Total Tabung</p>
                    <p className="text-2xl font-bold text-gray-800">{totalCylinders}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Pemakaian</p>
                    <p className={`text-2xl font-bold ${utilizationRate > 80 ? 'text-green-600' : 'text-blue-600'}`}>{utilizationRate}%</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Disewakan</p>
                    <p className="text-2xl font-bold text-indigo-600">{rentedCount}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Perlu Isi Ulang</p>
                    <p className="text-2xl font-bold text-orange-500">{refillCount}</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Gas Type Distribution */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-6">Persediaan per Jenis Gas</h3>
                     <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={gasDistributionData}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                <Tooltip cursor={{fill: '#f8fafc'}} contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} />
                                <Bar dataKey="count" fill="#6366f1" radius={[4, 4, 0, 0]} barSize={40} />
                            </BarChart>
                        </ResponsiveContainer>
                     </div>
                 </div>

                 {/* Status Distribution */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-2">Rincian Status Saat Ini</h3>
                     <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusDistributionData}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusDistributionData.map((entry, index) => (
                                        <Cell key={`cell-${index}`} fill={entry.color} />
                                    ))}
                                </Pie>
                                <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} />
                                <Legend verticalAlign="bottom" height={36} iconType="circle"/>
                            </PieChart>
                        </ResponsiveContainer>
                     </div>
                 </div>
             </div>
        </div>
      )}

      {/* TAB: DELIVERY */}
      {activeTab === 'delivery' && (
        <div className="space-y-4 animate-fade-in">
            <Paginasi
                halaman={halamanPengiriman.halaman}
                totalHalaman={halamanPengiriman.totalHalaman}
                totalBaris={halamanPengiriman.totalBaris}
                perHalaman={halamanPengiriman.perHalaman}
                onPindah={halamanPengiriman.setHalaman}
            />

            {deliveryGroups.length > 0 ? (
                <div className="space-y-4">
                    {deliveryGroups.map(([date, txs]) => (
                        <DeliveryManifestCard key={date} date={date} txs={txs} petaTabung={petaTabung} />
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                    <span className="material-icons text-4xl mb-2 text-gray-300">local_shipping</span>
                    <p>Belum ada riwayat pengiriman.</p>
                </div>
            )}

            {deliveryGroups.length > 0 && (
                <Paginasi
                    halaman={halamanPengiriman.halaman}
                    totalHalaman={halamanPengiriman.totalHalaman}
                    totalBaris={halamanPengiriman.totalBaris}
                    perHalaman={halamanPengiriman.perHalaman}
                    onPindah={halamanPengiriman.setHalaman}
                />
            )}
        </div>
      )}

      {/* TAB: LAPORAN HARIAN */}
      {activeTab === 'harian' && (
          <div className="space-y-6 animate-fade-in">
              <div className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex flex-col sm:flex-row sm:items-center gap-3">
                  <label htmlFor="tanggal-harian" className="text-sm font-medium text-gray-700 shrink-0">
                      Tanggal laporan
                  </label>
                  <input
                      id="tanggal-harian"
                      type="date"
                      value={tanggalHarian}
                      max={hariIni()}
                      onChange={e => setTanggalHarian(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                  <span className="text-sm text-gray-500 sm:ml-auto">
                      {tanggalHarian
                          ? new Date(`${tanggalHarian}T00:00:00`).toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
                          : 'Pilih tanggal'}
                  </span>
              </div>

              <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {/* Uang masuk dipecah di kartunya sendiri, bukan di kartu terpisah di
                      bawah: yang dicari saat membuka laporan adalah baris ringkasan ini,
                      dan angka yang harus dicocokkan dengan laci ada di sini.

                      Disebut "Uang Masuk", bukan "Pemasukan", karena deposit jaminan ikut
                      terhitung -- dan deposit bukan pendapatan. Tab Keuangan memakai kata
                      "Pemasukan" untuk angka yang memberi makan Laba Bersih; dua layar
                      dengan satu nama tapi dua arti adalah cara paling mudah membuat orang
                      salah membaca labanya sendiri. */}
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm col-span-2 lg:col-span-1">
                      <p className="text-xs text-gray-500 uppercase font-bold">Uang Masuk</p>
                      <p className="text-2xl font-bold text-green-600">{formatIDR(laporanHarian.uangMasuk)}</p>
                      <p className="text-[11px] text-gray-400 mt-0.5">Yang harus cocok dengan isi laci dan rekening hari ini.</p>

                      {/* Melebar penuh di HP: setengah lebar memotong nama kelompok jadi
                          "Tidak Dic..." -- rincian yang tidak terbaca tidak ada gunanya. */}
                      <div className="mt-3 pt-3 border-t border-gray-100 space-y-2">
                          {pemasukanPerMetode.map(metode => (
                              <div key={metode.id} className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 min-w-0 text-gray-500">
                                      <span className="material-icons text-sm text-gray-400 shrink-0">{metode.ikon}</span>
                                      <span className="text-xs truncate">{metode.label}</span>
                                  </span>
                                  <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatIDR(metode.total)}</span>
                              </div>
                          ))}
                      </div>

                      {/* Bukan kelompok metode tambahan, jadi dipisah garis putus-putus dan
                          diberi kepala "di antaranya": rincian metode di atas harus tetap
                          terbaca sebagai pemecahan yang menjumlah pas ke angka besarnya.
                          Yang di bawah ini irisan, bukan tambahan.

                          Sewa dan jual regulator dipisah, bukan disatukan jadi satu angka.
                          Keduanya kelihatan sama di laporan -- sama-sama rupiah masuk hari
                          itu -- padahal yang satu barangnya akan kembali dan yang satu tidak
                          pernah. Justru pemisahan itu yang dicari saat membuka laporan. */}
                      {(laporanHarian.depositMasuk > 0 || regulatorHarian.total > 0) && (
                          <div className="mt-3 pt-3 border-t border-dashed border-gray-200 space-y-2">
                              <p className="text-[11px] font-bold uppercase tracking-wide text-gray-400">Di antaranya</p>

                              {laporanHarian.depositMasuk > 0 && (
                                  <>
                                      <div className="flex items-center justify-between gap-2">
                                          <span className="flex items-center gap-1.5 min-w-0 text-gray-500">
                                              <span className="material-icons text-sm text-gray-400 shrink-0">savings</span>
                                              <span className="text-xs truncate">Deposit jaminan</span>
                                          </span>
                                          <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatIDR(laporanHarian.depositMasuk)}</span>
                                      </div>
                                      <p className="text-[11px] text-gray-400 -mt-1 pl-6">
                                          Titipan pelanggan, dikembalikan saat berhenti menyewa. Tidak dihitung sebagai laba.
                                      </p>
                                  </>
                              )}

                              {regulatorHarian.total > 0 && (
                              <div className="flex items-center justify-between gap-2">
                                  <span className="flex items-center gap-1.5 min-w-0 text-gray-500">
                                      <span className="material-icons text-sm text-gray-400 shrink-0">settings_input_component</span>
                                      <span className="text-xs truncate">Regulator</span>
                                  </span>
                                  <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatIDR(regulatorHarian.total)}</span>
                              </div>
                              )}

                              {regulatorHarian.sewa > 0 && (
                                  <div className="flex items-center justify-between gap-2 pl-4">
                                      <span className="flex items-center gap-1.5 min-w-0 text-gray-500">
                                          <span className="material-icons text-sm text-gray-400 shrink-0">swap_horiz</span>
                                          <span className="text-xs truncate">Disewakan &middot; {regulatorHarian.unitSewa} unit</span>
                                      </span>
                                      <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatIDR(regulatorHarian.sewa)}</span>
                                  </div>
                              )}

                              {regulatorHarian.jual > 0 && (
                                  <div className="flex items-center justify-between gap-2 pl-4">
                                      <span className="flex items-center gap-1.5 min-w-0 text-gray-500">
                                          <span className="material-icons text-sm text-gray-400 shrink-0">sell</span>
                                          <span className="text-xs truncate">Terjual &middot; {regulatorHarian.unitJual} unit</span>
                                      </span>
                                      <span className="text-sm font-bold text-gray-800 whitespace-nowrap">{formatIDR(regulatorHarian.jual)}</span>
                                  </div>
                              )}
                          </div>
                      )}
                  </div>
                  {/* Deposit yang dikembalikan juga uang yang keluar dari laci. Tanpa ini,
                      hari ketika seorang pelanggan berhenti menyewa akan menyisakan laci
                      yang kurang tanpa satu baris pun di laporan yang menerangkannya. */}
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 uppercase font-bold">Uang Keluar</p>
                      <p className="text-2xl font-bold text-red-600">{formatIDR(laporanHarian.uangKeluar)}</p>
                      {laporanHarian.depositKeluar > 0 && (
                          <p className="text-[11px] text-gray-400 mt-2 pt-2 border-t border-dashed border-gray-200">
                              Termasuk {formatIDR(laporanHarian.depositKeluar)} deposit yang dikembalikan.
                          </p>
                      )}
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 uppercase font-bold">Jumlah Transaksi</p>
                      <p className="text-2xl font-bold text-gray-800">{laporanHarian.jumlahTransaksi}</p>
                  </div>
              </div>

              {laporanHarian.transaksi.length > 0 ? (
                  <div className="space-y-4">
                      {/* Desktop: tabel. HP: kartu -- kolom Jumlah dulu tersembunyi di
                          balik geser samping, padahal itu kolom yang paling dicari. */}
                      <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                          <table className="w-full text-left text-sm">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                  <tr>
                                      <th className="px-6 py-3 font-semibold text-gray-700 w-24">Jam</th>
                                      <th className="px-6 py-3 font-semibold text-gray-700 w-32">Jenis</th>
                                      <th className="px-6 py-3 font-semibold text-gray-700">Detail Item</th>
                                      <th className="px-6 py-3 font-semibold text-gray-700">Pihak Terkait</th>
                                      <th className="px-6 py-3 font-semibold text-gray-700 text-right">Jumlah</th>
                                  </tr>
                              </thead>
                              <tbody className="divide-y divide-gray-100">
                                  {halamanHarian.halamanIni.map(t => {
                                      const cyl = petaTabung.get(t.cylinderId ?? '');
                                      const member = petaPelanggan.get(t.memberId ?? '');
                                      const station = petaVendor.get(t.refillStationId ?? '');
                                      const detail = detailBaris(t, cyl?.serialCode);
                                      return (
                                          <tr key={t.id} className="hover:bg-gray-50">
                                              <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                  {new Date(t.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                              </td>
                                              <td className="px-6 py-4">
                                                  <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeBadgeClass(t.type)}`}>
                                                      {labelJenisTransaksi(t.type)}
                                                  </span>
                                              </td>
                                              <td className="px-6 py-4 text-gray-700">
                                                  {detail.utama}
                                                  {detail.catatan && (
                                                      <span className="block text-[11px] text-gray-400 mt-0.5">{detail.catatan}</span>
                                                  )}
                                              </td>
                                              <td className="px-6 py-4 text-gray-700">
                                                  {member ? member.companyName : (station ? station.name : '-')}
                                              </td>
                                              <td className="px-6 py-4 text-right font-medium">
                                                  {t.cost ? formatIDR(t.cost) : '-'}
                                                  {/* Penanda metode hanya pada baris yang ikut dihitung
                                                      sebagai pemasukan -- itu yang direkap di kartu atas,
                                                      jadi angkanya bisa ditelusuri per baris. */}
                                                  {barisPendapatan(t) && (
                                                      <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                                                          {kelompokMetode(t).label}
                                                      </span>
                                                  )}
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>

                      <div className="md:hidden space-y-3">
                          {halamanHarian.halamanIni.map(t => {
                              const cyl = petaTabung.get(t.cylinderId ?? '');
                              const member = petaPelanggan.get(t.memberId ?? '');
                              const station = petaVendor.get(t.refillStationId ?? '');
                              const detail = detailBaris(t, cyl?.serialCode);
                              return (
                                  <div key={t.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm space-y-2">
                                      <div className="flex justify-between items-center gap-2">
                                          <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeBadgeClass(t.type)}`}>
                                              {labelJenisTransaksi(t.type)}
                                          </span>
                                          <span className="text-xs text-gray-500">
                                              {new Date(t.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                          </span>
                                      </div>
                                      <BarisKartu label="Item">
                                          {detail.utama}
                                          {detail.catatan && (
                                              <span className="block text-[11px] text-gray-400 mt-0.5">{detail.catatan}</span>
                                          )}
                                      </BarisKartu>
                                      <BarisKartu label="Pihak">{member ? member.companyName : (station ? station.name : '-')}</BarisKartu>
                                      <BarisKartu label="Jumlah">
                                          <span className="font-bold">{t.cost ? formatIDR(t.cost) : '-'}</span>
                                          {barisPendapatan(t) && (
                                              <span className="block text-[11px] font-normal text-gray-400 mt-0.5">
                                                  {kelompokMetode(t).label}
                                              </span>
                                          )}
                                      </BarisKartu>
                                  </div>
                              );
                          })}
                      </div>

                      <Paginasi
                          halaman={halamanHarian.halaman}
                          totalHalaman={halamanHarian.totalHalaman}
                          totalBaris={halamanHarian.totalBaris}
                          perHalaman={halamanHarian.perHalaman}
                          onPindah={halamanHarian.setHalaman}
                      />
                  </div>
              ) : (
                  <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                      <span className="material-icons text-3xl mb-2">event_busy</span>
                      <p>Tidak ada transaksi pada tanggal ini.</p>
                  </div>
              )}
          </div>
      )}

      {/* TAB: FINANCIALS */}
      {activeTab === 'financials' && bolehRekapPenuh && (
          <div className="space-y-6 animate-fade-in">
              {/* Pencatatan pengeluaran hidup di dalam guard tab ini, jadi ia ikut
                  hilang sendiri untuk Operator tanpa perlu penjagaan kedua. */}
              {onCatatPengeluaran && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                          <h3 className="font-bold text-gray-800">Rekap Keuangan</h3>
                          <p className="text-xs text-gray-500">Seluruh pemasukan dan pengeluaran yang tercatat.</p>
                      </div>
                      <button
                          onClick={() => setModalPengeluaran(true)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                      >
                          <span className="material-icons text-lg">add</span>
                          Catat Pengeluaran
                      </button>
                  </div>
              )}

              {pesanBerhasil && (
                  <div className="px-4 py-3 rounded-xl text-sm font-medium border bg-green-50 text-green-700 border-green-100">
                      {pesanBerhasil}
                  </div>
              )}

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-green-50 rounded-xl text-green-600">
                          <span className="material-icons text-3xl">payments</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Total Pemasukan</p>
                          <h3 className="text-2xl font-bold text-gray-800">{formatIDR(totalIncome)}</h3>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-red-50 rounded-xl text-red-600">
                          <span className="material-icons text-3xl">trending_down</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Total Pengeluaran</p>
                          <h3 className="text-2xl font-bold text-gray-800">{formatIDR(totalExpenses)}</h3>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${netProfit >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                          <span className="material-icons text-3xl">account_balance_wallet</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Laba Bersih</p>
                          <h3 className={`text-2xl font-bold ${netProfit >= 0 ? 'text-indigo-700' : 'text-orange-600'}`}>{formatIDR(netProfit)}</h3>
                      </div>
                  </div>
              </div>

              {/* Pendapatan Regulator -- bagian DARI Total Pemasukan, bukan tambahan.
                  Nominalnya sudah lama tersimpan di kolom transaksi, tapi belum pernah
                  punya tempat di layar mana pun: satu-satunya cara mengetahuinya adalah
                  membuka database. */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                      <div>
                          <h3 className="font-bold text-gray-800">Pendapatan Regulator</h3>
                          <p className="text-xs text-gray-500 mt-0.5">Sudah termasuk di Total Pemasukan, bukan tambahan di luarnya.</p>
                      </div>
                      <span className="text-sm font-bold text-gray-500 whitespace-nowrap">{formatIDR(rekapRegulator.total)}</span>
                  </div>

                  {rekapRegulator.total > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                              <p className="text-xs uppercase font-bold text-gray-500 flex items-center gap-1.5">
                                  <span className="material-icons text-base text-gray-400">swap_horiz</span>
                                  Disewakan
                              </p>
                              <p className="text-xl font-bold text-indigo-600 mt-1">{formatIDR(rekapRegulator.sewa)}</p>
                              <p className="text-xs text-gray-500">{rekapRegulator.unitSewa} unit keluar</p>
                          </div>
                          <div className="rounded-xl border border-gray-100 bg-gray-50 p-4">
                              <p className="text-xs uppercase font-bold text-gray-500 flex items-center gap-1.5">
                                  <span className="material-icons text-base text-gray-400">sell</span>
                                  Terjual
                              </p>
                              <p className="text-xl font-bold text-green-600 mt-1">{formatIDR(rekapRegulator.jual)}</p>
                              <p className="text-xs text-gray-500">{rekapRegulator.unitJual} unit terjual</p>
                          </div>
                      </div>
                  ) : (
                      <div className="h-24 flex items-center justify-center text-gray-400 text-sm text-center px-4">
                          Belum ada sewa atau penjualan regulator yang tercatat.
                      </div>
                  )}
              </div>

              {/* Pengeluaran per Pos -- memecah kartu Total Pengeluaran di atas supaya
                  terlihat ke mana uangnya, bukan cuma berapa. */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex items-center justify-between gap-3 mb-4">
                      <h3 className="font-bold text-gray-800">Pengeluaran per Pos</h3>
                      <span className="text-sm font-bold text-gray-500">{formatIDR(totalExpenses)}</span>
                  </div>

                  {rekapPos.length > 0 ? (
                      <div className="space-y-3">
                          {rekapPos.map(pos => (
                              <div key={pos.id}>
                                  <div className="flex items-center justify-between gap-3 mb-1.5">
                                      <div className="flex items-center gap-2 min-w-0">
                                          <span className="material-icons text-base text-gray-400 shrink-0">{pos.ikon}</span>
                                          <p className="text-sm text-gray-700 font-medium truncate">{pos.label}</p>
                                      </div>
                                      <div className="flex items-baseline gap-3 shrink-0">
                                          <p className="text-sm font-bold text-gray-900">{formatIDR(pos.total)}</p>
                                          <span className="text-xs text-gray-400 w-9 text-right">{pos.persen.toFixed(0)}%</span>
                                      </div>
                                  </div>
                                  <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                      <div className="h-full bg-red-400 rounded-full" style={{ width: `${pos.persen}%` }} />
                                  </div>
                              </div>
                          ))}
                      </div>
                  ) : (
                      <div className="h-24 flex items-center justify-center text-gray-400 text-sm">
                          Belum ada pengeluaran tercatat.
                      </div>
                  )}
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Financial Trends */}
                  <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-6">Kinerja Keuangan (Bulanan)</h3>
                      <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                              <BarChart data={financialTrendData}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#64748b', fontSize: 12}} />
                                  <Tooltip 
                                      contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} 
                                      formatter={(value: number) => formatIDR(value)}
                                  />
                                  <Legend verticalAlign="top" height={36}/>
                                  <Bar dataKey="Income" name="Pemasukan" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
                                  <Bar dataKey="Expense" name="Pengeluaran" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* Top Customers by Revenue */}
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4">Sumber Pendapatan Teratas</h3>
                      {revenueByMemberData.length > 0 ? (
                          <div className="space-y-4">
                              {revenueByMemberData.map((item, idx) => (
                                  <div key={idx} className="flex items-center justify-between">
                                      <div className="flex items-center gap-3 overflow-hidden">
                                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${idx === 0 ? 'bg-yellow-400' : 'bg-gray-300'}`}>
                                              {idx + 1}
                                          </div>
                                          <p className="text-sm text-gray-700 truncate font-medium">{item.name}</p>
                                      </div>
                                      <p className="text-sm font-bold text-gray-900">{formatIDR(item.value)}</p>
                                  </div>
                              ))}
                          </div>
                      ) : (
                          <div className="h-40 flex items-center justify-center text-gray-400 text-sm">
                              Belum ada data pendapatan.
                          </div>
                      )}
                  </div>
              </div>

              {/* Recent Activity List */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">Transaksi Keuangan Terbaru</h3>
                      <button onClick={() => setActiveTab('logs')} className="text-sm text-indigo-600 font-medium hover:underline">Lihat Semua</button>
                  </div>
                  <div className="divide-y divide-gray-100">
                      {recentFinancialActivity.length > 0 ? (
                          recentFinancialActivity.map(t => {
                              const isIncome = barisPendapatan(t);
                              const cyl = cylinders.find(c => c.id === t.cylinderId);
                              const member = members.find(m => m.id === t.memberId);
                              return (
                                  <div key={t.id} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-gray-50 transition-colors">
                                      <div className="flex items-center gap-3">
                                          <div className={`p-2 rounded-lg ${isIncome ? 'bg-green-50 text-green-600' : 'bg-red-50 text-red-600'}`}>
                                              <span className="material-icons text-sm">{isIncome ? 'arrow_upward' : 'arrow_downward'}</span>
                                          </div>
                                          <div>
                                              <p className="text-sm font-bold text-gray-800">
                                                  {t.type === 'GAS_EXCHANGE'
                                                      ? `Tukar Isi - ${member?.companyName || 'pembeli lepas'}`
                                                      : t.type === 'ORDER_PAYMENT'
                                                          // Keterangannya sudah memuat jenis pesanan dan nama pembelinya,
                                                          // jadi memberinya awalan lagi cuma mengulang kata yang sama.
                                                          ? t.description || `Pembayaran Pesanan - ${member?.companyName || 'pembeli lepas'}`
                                                          : t.type === 'INCOME'
                                                              ? `Penjualan Lain - ${t.description || 'tanpa keterangan'}`
                                                              : t.type === 'EXPENSE'
                                                                  ? `Biaya Operasional - ${t.description || 'tanpa keterangan'}`
                                                                  : isIncome
                                                                      ? `Pendapatan Sewa - ${member?.companyName || 'Tidak diketahui'}`
                                                                      : `Biaya Isi Ulang - ${cyl?.gasType}`}
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                  {new Date(t.date).toLocaleDateString('id-ID')} • {sebutanBarang(t, cyl?.serialCode)}
                                              </p>
                                          </div>
                                      </div>
                                      <span className={`font-bold font-mono ${isIncome ? 'text-green-600' : 'text-red-600'}`}>
                                          {isIncome ? '+' : '-'}{formatIDR(t.cost || 0)}
                                      </span>
                                  </div>
                              )
                          })
                      ) : (
                          <div className="p-8 text-center text-gray-400 text-sm">Belum ada transaksi.</div>
                      )}
                  </div>
              </div>

              {/* MODAL: CATAT PENGELUARAN */}
              {modalPengeluaran && onCatatPengeluaran && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
                      <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
                          <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                              <h3 className="font-bold flex items-center gap-2">
                                  <span className="material-icons">trending_down</span>
                                  Catat Pengeluaran
                              </h3>
                              <button onClick={tutupModalPengeluaran} className="text-indigo-200 hover:text-white">
                                  <span className="material-icons">close</span>
                              </button>
                          </div>

                          <form onSubmit={simpanPengeluaran} className="p-6 space-y-4">
                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Pos Belanja</label>
                                  <select
                                      value={posBaru}
                                      onChange={e => setPosBaru(e.target.value)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
                                  >
                                      {KATEGORI_PENGELUARAN.map(k => (
                                          <option key={k.id} value={k.id}>{k.label}</option>
                                      ))}
                                  </select>
                              </div>

                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Keterangan</label>
                                  <input
                                      type="text"
                                      required
                                      value={keteranganBaru}
                                      onChange={e => setKeteranganBaru(e.target.value)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                      placeholder="mis. Solar mobil pengiriman"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Tanggal</label>
                                  <input
                                      type="date"
                                      required
                                      value={tanggalBaru}
                                      max={hariIni()}
                                      onChange={e => setTanggalBaru(e.target.value)}
                                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                  />
                              </div>

                              <div>
                                  <label className="block text-sm font-medium text-gray-700 mb-1">Nominal</label>
                                  <div className="relative">
                                      <span className="absolute left-3 top-2 text-gray-500 text-sm">Rp</span>
                                      <input
                                          type="number"
                                          required
                                          min={1}
                                          value={nominalBaru}
                                          onChange={e => setNominalBaru(e.target.value)}
                                          className="w-full border border-gray-300 rounded-lg pl-10 pr-3 py-2 text-lg font-bold focus:ring-2 focus:ring-indigo-500 outline-none"
                                          placeholder="0"
                                      />
                                  </div>
                              </div>

                              {pesanGagal && (
                                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                                      {pesanGagal}
                                  </p>
                              )}

                              <div className="pt-2 flex justify-end gap-3">
                                  <button
                                      type="button"
                                      onClick={tutupModalPengeluaran}
                                      disabled={sedangSimpan}
                                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                                  >
                                      Batal
                                  </button>
                                  <button
                                      type="submit"
                                      disabled={!siapSimpan || sedangSimpan}
                                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                                  >
                                      {sedangSimpan ? 'Menyimpan...' : 'Simpan Pengeluaran'}
                                  </button>
                              </div>
                          </form>
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* TAB: AUDIT LOG */}
      {activeTab === 'logs' && (
          <div className="space-y-4 animate-fade-in">
              <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur rounded-xl border border-gray-200 p-3 shadow-sm flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1">
                        <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                        <input 
                            type="text" 
                            value={logFilter}
                            onChange={(e) => setLogFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Cari riwayat berdasarkan ID, pelanggan, kode..."
                        />
                  </div>
                  
                  <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[140px]"
                  >
                      <option value="ALL">Semua Jenis</option>
                      <option value="RENTAL_OUT">Sewa Keluar</option>
                      <option value="RETURN">Pengembalian</option>
                      <option value="REFILL_OUT">Kirim Isi Ulang</option>
                      <option value="REFILL_IN">Terima Isi Ulang</option>
                      <option value="DEBT_PAYMENT">Pembayaran Utang</option>
                      <option value="DEBT_ADD">Bon Dicatat</option>
                      <option value="DEPOSIT_REFUND">Pengembalian Deposit</option>
                      <option value="DELIVERY">Pengiriman</option>
                      <option value="GAS_EXCHANGE">Tukar Isi</option>
                      <option value="ORDER_PAYMENT">Pembayaran Pesanan</option>
                      <option value="DEBT_REMOVED">Bon Dihapus</option>
                      <option value="CYLINDER_SWAP">Tukar Tabung Pabrik</option>
                      <option value="INCOME">Penjualan Lain</option>
                      <option value="EXPENSE">Biaya Operasional</option>
                  </select>

                  {/* Disembunyikan di HP: di sana selalu kartu, jadi pilihannya tidak berarti. */}
                  <div className="hidden md:flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    <button
                        onClick={() => setViewMode('table')}
                        className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Tampilan Tabel"
                    >
                        <span className="material-icons text-xl">table_chart</span>
                    </button>
                    <button
                        onClick={() => setViewMode('card')}
                        className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'card' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Tampilan Kartu"
                    >
                        <span className="material-icons text-xl">grid_view</span>
                    </button>
                  </div>
              </div>

              <div className="space-y-3">
                  {filteredLogs.length > 0 ? (
                    <>
                      <Paginasi
                          halaman={halamanLogs.halaman}
                          totalHalaman={halamanLogs.totalHalaman}
                          totalBaris={halamanLogs.totalBaris}
                          perHalaman={halamanLogs.perHalaman}
                          onPindah={halamanLogs.setHalaman}
                      />

                      {/* Tabel hanya di desktop. Di HP tabel ini harus digeser ke samping
                          untuk melihat kolom Jumlah, jadi di sana selalu kartu. */}
                      {viewMode === 'table' && (
                          <div className="hidden md:block bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-40">Tanggal</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-32">Jenis</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Detail Item</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Pihak Terkait</th>
                                            {bolehRekapPenuh && <th className="px-6 py-3 font-semibold text-gray-700 text-right">Jumlah</th>}
                                            <th className="px-6 py-3 font-semibold text-gray-700 text-right">Status</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700 text-right w-12"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {halamanLogs.halamanIni.map(t => {
                                            const cyl = petaTabung.get(t.cylinderId ?? '');
                                            const member = petaPelanggan.get(t.memberId ?? '');
                                            const station = petaVendor.get(t.refillStationId ?? '');
                                            return (
                                                <tr key={t.id} className="hover:bg-gray-50">
                                                    <td className="px-6 py-4 text-gray-500 whitespace-nowrap">
                                                        <div className="font-medium text-gray-800">{new Date(t.date).toLocaleDateString('id-ID')}</div>
                                                        <div className="text-xs">{new Date(t.date).toLocaleTimeString('id-ID', {hour: '2-digit', minute:'2-digit'})}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeBadgeClass(t.type)}`}>
                                                            {labelJenisTransaksi(t.type)}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {cyl ? (
                                                            <div>
                                                                <div className="font-mono font-medium text-gray-800">{cyl.serialCode}</div>
                                                                <div className="text-xs text-gray-500">{cyl.gasType} • {cyl.size}</div>
                                                            </div>
                                                        ) : t.description ? (
                                                            // Baris kas tidak menyangkut tabung -- keterangannya yang
                                                            // menjelaskan barisnya, tanpa ini kolomnya cuma "N/A".
                                                            <span className="text-gray-700">{t.description}</span>
                                                        ) : (
                                                            <span className="text-gray-400 italic">N/A</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        {member ? member.companyName : (station ? station.name : '-')}
                                                    </td>
                                                    {bolehRekapPenuh && (
                                                        <td className="px-6 py-4 text-right font-medium">
                                                            {t.cost ? formatIDR(t.cost) : '-'}
                                                        </td>
                                                    )}
                                                    <td className="px-6 py-4 text-right">
                                                        {t.paymentStatus ? (
                                                            <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${t.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                {labelStatusBayar(t.paymentStatus)}
                                                            </span>
                                                        ) : t.rentalDuration ? (
                                                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
                                                                {t.rentalDuration} Days
                                                            </span>
                                                        ) : (
                                                            <span className="text-gray-400">-</span>
                                                        )}
                                                    </td>
                                                    <td className="px-3 py-4 text-right">
                                                        {bisaDibatalkan(t) && (
                                                            <button
                                                                onClick={() => bukaBatal(t)}
                                                                title="Batalkan transaksi ini"
                                                                className="p-1.5 rounded text-gray-400 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                            >
                                                                <span className="material-icons text-base">undo</span>
                                                            </button>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                          </div>
                      )}

                      {/* Kartu: selalu tampil di HP, dan di desktop kalau modenya kartu. */}
                      <div className={`space-y-3 ${viewMode === 'table' ? 'md:hidden' : ''}`}>
                        {halamanLogs.halamanIni.map(t => {
                          const info = getTxDescription(t, bolehRekapPenuh);
                          return (
                            <div key={t.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-4 items-start">
                                {/* Timeline Line (Visual Only) */}
                                <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${info.color}`}>
                                    <span className="material-icons text-sm">{info.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        {/* Membungkus di HP, memotong di desktop. Kartu kini tampilan
                                            utama di layar sempit, dan "Menyewakan ..." yang terpotong
                                            tidak memberi tahu apa pun. */}
                                        <h4 className="text-sm font-bold text-gray-800 break-words md:truncate">{info.title}</h4>
                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(t.date).toLocaleDateString('id-ID')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-0.5 break-words md:truncate">{info.subtitle}</p>
                                    <div className="flex items-center gap-2 mt-2">
                                        <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded font-mono">
                                            ID: {t.id.split('-').pop()}
                                        </span>
                                        {t.rentalDuration !== undefined && t.rentalDuration > 0 && (
                                            <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                                                {t.rentalDuration} Days
                                            </span>
                                        )}
                                        {t.paymentStatus && (
                                             <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${t.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                {labelStatusBayar(t.paymentStatus)}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                <div className="text-right shrink-0 flex flex-col items-end gap-1">
                                    {bolehRekapPenuh && t.cost && (
                                        <span className="block font-bold text-gray-700 text-sm">{formatIDR(t.cost)}</span>
                                    )}
                                    {bisaDibatalkan(t) && (
                                        <button
                                            onClick={() => bukaBatal(t)}
                                            className="min-h-[36px] px-2 rounded-lg text-xs font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-colors flex items-center gap-1"
                                        >
                                            <span className="material-icons text-sm">undo</span>
                                            Batalkan
                                        </button>
                                    )}
                                </div>
                            </div>
                          );
                        })}
                      </div>

                      <Paginasi
                          halaman={halamanLogs.halaman}
                          totalHalaman={halamanLogs.totalHalaman}
                          totalBaris={halamanLogs.totalBaris}
                          perHalaman={halamanLogs.perHalaman}
                          onPindah={halamanLogs.setHalaman}
                      />
                    </>
                  ) : (
                      <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                          <span className="material-icons text-3xl mb-2">search_off</span>
                          <p>Tidak ada transaksi yang cocok dengan filter.</p>
                      </div>
                  )}
              </div>
          </div>
      )}

      {/* DIALOG PEMBATALAN */}
      {akanDibatalkan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
            <div className="bg-red-600 px-6 py-4 flex justify-between items-center text-white">
              <h3 className="font-bold flex items-center gap-2">
                <span className="material-icons">undo</span>
                Batalkan Transaksi
              </h3>
              <button onClick={() => setAkanDibatalkan(null)} className="text-red-100 hover:text-white">
                <span className="material-icons">close</span>
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="text-sm text-gray-700 space-y-1">
                <p className="font-bold">{getTxDescription(akanDibatalkan, bolehRekapPenuh).title}</p>
                <p className="text-xs text-gray-500">
                  {new Date(akanDibatalkan.date).toLocaleString('id-ID')}
                  {bolehRekapPenuh && akanDibatalkan.cost ? ` • ${formatIDR(akanDibatalkan.cost)}` : ''}
                </p>
              </div>

              {/* Disebut apa adanya: yang membuat pembatalan berguna sekaligus berisiko
                  adalah efek sampingnya, bukan hilangnya baris ini dari daftar. */}
              <p className="text-xs text-gray-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                Stok, status tabung, deposit, dan bon pelanggan yang terpengaruh akan
                dikembalikan seperti sebelum transaksi ini dicatat. Barisnya tetap
                tersimpan sebagai riwayat, tapi tidak lagi dihitung di laporan mana pun.
              </p>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Alasan (opsional)</label>
                <input
                  type="text"
                  value={alasanBatal}
                  onChange={e => setAlasanBatal(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder="mis. salah pilih pelanggan"
                />
              </div>

              {gagalBatal && (
                <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {gagalBatal}
                </p>
              )}

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setAkanDibatalkan(null)}
                  disabled={sedangBatal}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors disabled:opacity-50"
                >
                  Tutup
                </button>
                <button
                  onClick={jalankanBatal}
                  disabled={sedangBatal}
                  className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors disabled:opacity-60"
                >
                  {sedangBatal ? 'Membatalkan...' : 'Batalkan Transaksi'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ReportsView;