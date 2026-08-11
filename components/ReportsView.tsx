import React, { useState, useMemo, useEffect } from 'react';
import { Cylinder, Transaction, Member, RefillStation, GasType, CylinderStatus, UserRole } from '../types';
import { labelJenisTransaksi, labelStatusBayar } from '../labels';
import { sebutanBarang } from '../lib/bulkStock';
import { bolehLihatKeuanganPenuh } from '../lib/peran';
import { hariIni, hitungLaporanHarian } from '../lib/laporanHarian';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '../lib/supabase';

interface ReportsViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
  role?: UserRole;
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

// Sub-component for individual delivery card with toggle state
const DeliveryManifestCard: React.FC<{ date: string, txs: Transaction[], cylinders: Cylinder[] }> = ({ date, txs, cylinders }) => {
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
                        const cyl = cylinders.find(c => c.id === t.cylinderId);
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

const ReportsView: React.FC<ReportsViewProps> = ({ cylinders, transactions, members, stations, role }) => {
  // Rekap menyeluruh -- total, tren bulanan, laba, peringkat pelanggan -- hanya untuk
  // Administrator. Peran lain melihat keuangan sehari demi sehari lewat tab Harian.
  const bolehRekapPenuh = bolehLihatKeuanganPenuh(role);

  const [activeTab, setActiveTab] = useState<'inventory' | 'financials' | 'logs' | 'delivery' | 'harian'>(
    bolehRekapPenuh ? 'financials' : 'harian');
  const [tanggalHarian, setTanggalHarian] = useState(hariIni);
  const [logFilter, setLogFilter] = useState('');
  
  // -- New State for Logs --
  const [viewMode, setViewMode] = useState<'table' | 'card'>('table');
  const [selectedType, setSelectedType] = useState<string>('ALL');

  // -- Delivery Pagination State --
  const [deliveryPage, setDeliveryPage] = useState(1);
  const [deliveryTransactions, setDeliveryTransactions] = useState<Transaction[]>([]);
  const [totalDeliveryCount, setTotalDeliveryCount] = useState(0);
  const [isDeliveryLoading, setIsDeliveryLoading] = useState(false);
  const DELIVERY_ITEMS_PER_PAGE = 20;

  // -- Helpers --
  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  
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
  // Tukar isi juga pendapatan -- kalau hanya RENTAL_OUT yang dihitung, penjualan
  // gas ke pembeli lepas hilang dari laporan.
  const incomeTransactions = transactions.filter(
    t => (t.type === 'RENTAL_OUT' || t.type === 'GAS_EXCHANGE') && (t.cost || 0) > 0
  );
  // Biaya isi ulang ke vendor dan belanja operasional harian sama-sama uang keluar.
  const expenseTransactions = transactions.filter(
    t => (t.type === 'REFILL_IN' || t.type === 'EXPENSE') && (t.cost || 0) > 0
  );

  const totalIncome = incomeTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const netProfit = totalIncome - totalExpenses;

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
        
        // Tukar isi ikut pendapatan, sama seperti saringan di atas -- kalau hanya
        // RENTAL_OUT yang dijumlah, grafik ini lebih kecil dari KPI Total Pemasukan.
        if (t.type === 'RENTAL_OUT' || t.type === 'GAS_EXCHANGE') {
            monthlyData[key].Income += (t.cost || 0);
        } else if (t.type === 'REFILL_IN' || t.type === 'EXPENSE') {
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

  // -- Data Processing: Logs --
  const filteredLogs = useMemo(() => {
      return transactions.filter(t => {
          const cyl = cylinders.find(c => c.id === t.cylinderId);
          const member = members.find(m => m.id === t.memberId);
          const station = stations.find(s => s.id === t.refillStationId);
          
          const searchStr = `${t.id} ${t.type} ${cyl?.serialCode} ${member?.companyName} ${station?.name}`.toLowerCase();
          const matchesSearch = searchStr.includes(logFilter.toLowerCase());
          const matchesType = selectedType === 'ALL' || t.type === selectedType;
          
          return matchesSearch && matchesType;
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, cylinders, members, stations, logFilter, selectedType]);

  // -- Fetch Delivery Data --
  useEffect(() => {
    if (activeTab === 'delivery') {
      const fetchDelivery = async () => {
        setIsDeliveryLoading(true);
        try {
            const from = (deliveryPage - 1) * DELIVERY_ITEMS_PER_PAGE;
            const to = from + DELIVERY_ITEMS_PER_PAGE - 1;

            const { data, count, error } = await supabase
                .from('transactions')
                .select('*', { count: 'exact' })
                .eq('type', 'DELIVERY')
                .order('date', { ascending: false })
                .range(from, to);
            
            if (error) throw error;
            if (data) setDeliveryTransactions(data);
            if (count !== null) setTotalDeliveryCount(count);
        } catch (e) {
            console.error("Error fetching delivery reports:", e);
        } finally {
            setIsDeliveryLoading(false);
        }
      };
      fetchDelivery();
    }
  }, [activeTab, deliveryPage]);

  // -- Data Processing: Delivery --
  const deliveryGroups = useMemo(() => {
    // Only process if we have delivery transactions
    if (activeTab !== 'delivery') return [];

    const groups: Record<string, Transaction[]> = {};
    deliveryTransactions.forEach(t => {
        const dateKey = t.date; 
        if (!groups[dateKey]) groups[dateKey] = [];
        groups[dateKey].push(t);
    });
    
    return Object.entries(groups)
        .sort((a, b) => new Date(b[0]).getTime() - new Date(a[0]).getTime()); 
  }, [deliveryTransactions, activeTab]);

  // tampilkanNominal dilewatkan dari pemanggil: baris REFILL_IN menempelkan biaya ke
  // subtitle, jadi menyembunyikan kolom Jumlah saja tidak cukup menutup nominalnya.
  const getTxDescription = (t: Transaction, tampilkanNominal = true) => {
      const cyl = cylinders.find(c => c.id === t.cylinderId);
      const member = members.find(m => m.id === t.memberId);
      const station = stations.find(s => s.id === t.refillStationId);
      const code = cyl?.serialCode || 'Tidak diketahui';

      switch(t.type) {
          case 'RENTAL_OUT': return { title: `Menyewakan ${code}`, subtitle: `Ke ${member?.companyName}`, icon: 'shopping_cart', color: 'bg-blue-100 text-blue-600', badge: 'SEWA' };
          case 'RETURN': return { title: `Dikembalikan ${code}`, subtitle: `Dari ${member?.companyName}`, icon: 'assignment_return', color: 'bg-green-100 text-green-600', badge: 'KEMBALI' };
          case 'REFILL_OUT': return { title: `Kirim Isi Ulang ${code}`, subtitle: `Ke ${station?.name}`, icon: 'local_shipping', color: 'bg-orange-100 text-orange-600', badge: 'KIRIM' };
          case 'REFILL_IN': return { title: `Diterima Kembali ${code}`, subtitle: tampilkanNominal ? `Biaya: ${t.cost ? formatIDR(t.cost) : '-'}` : `Dari ${station?.name || 'isi ulang'}`, icon: 'inventory_2', color: 'bg-indigo-100 text-indigo-600', badge: 'TERIMA' };
          case 'DEBT_PAYMENT': return { title: 'Pembayaran Utang', subtitle: `Dari ${member?.companyName}`, icon: 'payments', color: 'bg-teal-100 text-teal-600', badge: 'BAYAR' };
          case 'DEPOSIT_REFUND': return { title: 'Pengembalian Deposit', subtitle: `Ke ${member?.companyName}`, icon: 'savings', color: 'bg-purple-100 text-purple-600', badge: 'REFUND' };
          case 'DELIVERY': return { title: `Pengiriman ${code}`, subtitle: 'Dalam Perjalanan', icon: 'local_shipping', color: 'bg-cyan-100 text-cyan-600', badge: 'ANTAR' };
          case 'GAS_EXCHANGE': return { title: `Tukar Isi ${sebutanBarang(t)}`, subtitle: member ? `Untuk ${member.companyName}` : 'Pembeli lepas', icon: 'swap_horiz', color: 'bg-teal-100 text-teal-600', badge: 'TUKAR' };
          case 'EXPENSE': return { title: t.description || 'Biaya Operasional', subtitle: 'Belanja operasional', icon: 'receipt_long', color: 'bg-rose-100 text-rose-600', badge: 'BIAYA' };
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
          case 'DEPOSIT_REFUND': return 'bg-purple-100 text-purple-800';
          case 'DELIVERY': return 'bg-cyan-100 text-cyan-800';
          case 'GAS_EXCHANGE': return 'bg-teal-100 text-teal-800';
          case 'EXPENSE': return 'bg-rose-100 text-rose-800';
          default: return 'bg-gray-100 text-gray-800';
      }
  };

  const totalDeliveryPages = Math.ceil(totalDeliveryCount / DELIVERY_ITEMS_PER_PAGE);

  const PaginationControls = () => (
      <div className="flex items-center justify-between bg-white p-3 rounded-lg border border-gray-200 shadow-sm">
          <button 
              onClick={() => setDeliveryPage(p => Math.max(1, p - 1))}
              disabled={deliveryPage === 1 || isDeliveryLoading}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors flex items-center gap-1"
          >
              <span className="material-icons text-sm">chevron_left</span> Previous
          </button>
          <span className="text-xs font-medium text-gray-500">
              {isDeliveryLoading ? 'Memuat...' : `Halaman ${deliveryPage} dari ${totalDeliveryPages || 1}`}
          </span>
          <button 
              onClick={() => setDeliveryPage(p => Math.min(totalDeliveryPages, p + 1))}
              disabled={deliveryPage === totalDeliveryPages || isDeliveryLoading || totalDeliveryPages === 0}
              className="px-3 py-1 text-sm text-gray-600 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors flex items-center gap-1"
          >
              Next <span className="material-icons text-sm">chevron_right</span>
          </button>
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
            {/* Top Pagination */}
            <PaginationControls />

            {/* List */}
            {isDeliveryLoading ? (
                <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200">
                    <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin mx-auto mb-2"></div>
                    <p>Memuat laporan pengiriman...</p>
                </div>
            ) : deliveryGroups.length > 0 ? (
                <div className="space-y-4">
                    {deliveryGroups.map(([date, txs]) => (
                        <DeliveryManifestCard key={date} date={date} txs={txs} cylinders={cylinders} />
                    ))}
                </div>
            ) : (
                <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                    <span className="material-icons text-4xl mb-2 text-gray-300">local_shipping</span>
                    <p>Belum ada riwayat pengiriman.</p>
                </div>
            )}

            {/* Bottom Pagination */}
            {deliveryGroups.length > 0 && <PaginationControls />}
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
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 uppercase font-bold">Pemasukan</p>
                      <p className="text-2xl font-bold text-green-600">{formatIDR(laporanHarian.pemasukan)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                      <p className="text-xs text-gray-500 uppercase font-bold">Pengeluaran</p>
                      <p className="text-2xl font-bold text-red-600">{formatIDR(laporanHarian.pengeluaran)}</p>
                  </div>
                  <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm col-span-2 lg:col-span-1">
                      <p className="text-xs text-gray-500 uppercase font-bold">Jumlah Transaksi</p>
                      <p className="text-2xl font-bold text-gray-800">{laporanHarian.jumlahTransaksi}</p>
                  </div>
              </div>

              {laporanHarian.transaksi.length > 0 ? (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                      <div className="overflow-x-auto">
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
                                  {laporanHarian.transaksi.map(t => {
                                      const cyl = cylinders.find(c => c.id === t.cylinderId);
                                      const member = members.find(m => m.id === t.memberId);
                                      const station = stations.find(s => s.id === t.refillStationId);
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
                                              <td className="px-6 py-4 text-gray-700">{sebutanBarang(t, cyl?.serialCode)}</td>
                                              <td className="px-6 py-4 text-gray-700">
                                                  {member ? member.companyName : (station ? station.name : '-')}
                                              </td>
                                              <td className="px-6 py-4 text-right font-medium">
                                                  {t.cost ? formatIDR(t.cost) : '-'}
                                              </td>
                                          </tr>
                                      );
                                  })}
                              </tbody>
                          </table>
                      </div>
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
                              const isIncome = t.type === 'RENTAL_OUT' || t.type === 'GAS_EXCHANGE';
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
                      <option value="DEPOSIT_REFUND">Pengembalian Deposit</option>
                      <option value="DELIVERY">Pengiriman</option>
                      <option value="GAS_EXCHANGE">Tukar Isi</option>
                      <option value="EXPENSE">Biaya Operasional</option>
                  </select>

                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
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
                      viewMode === 'table' ? (
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                              <div className="overflow-x-auto">
                                <table className="w-full text-left text-sm">
                                    <thead className="bg-gray-50 border-b border-gray-200">
                                        <tr>
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-40">Tanggal</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-32">Jenis</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Detail Item</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Pihak Terkait</th>
                                            {bolehRekapPenuh && <th className="px-6 py-3 font-semibold text-gray-700 text-right">Jumlah</th>}
                                            <th className="px-6 py-3 font-semibold text-gray-700 text-right">Status</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {filteredLogs.map(t => {
                                            const cyl = cylinders.find(c => c.id === t.cylinderId);
                                            const member = members.find(m => m.id === t.memberId);
                                            const station = stations.find(s => s.id === t.refillStationId);
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
                                                            // Baris pengeluaran tidak menyangkut tabung -- keterangannya yang
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
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                              </div>
                          </div>
                      ) : (
                        filteredLogs.map(t => {
                          const info = getTxDescription(t, bolehRekapPenuh);
                          return (
                            <div key={t.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm flex gap-4 items-start">
                                {/* Timeline Line (Visual Only) */}
                                <div className={`mt-1 w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${info.color}`}>
                                    <span className="material-icons text-sm">{info.icon}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex justify-between items-start">
                                        <h4 className="text-sm font-bold text-gray-800 truncate">{info.title}</h4>
                                        <span className="text-xs text-gray-400 whitespace-nowrap ml-2">
                                            {new Date(t.date).toLocaleDateString('id-ID')}
                                        </span>
                                    </div>
                                    <p className="text-xs text-gray-600 mt-0.5 truncate">{info.subtitle}</p>
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
                                {bolehRekapPenuh && t.cost && (
                                    <div className="text-right">
                                        <span className="block font-bold text-gray-700 text-sm">{formatIDR(t.cost)}</span>
                                    </div>
                                )}
                            </div>
                          );
                        })
                      )
                  ) : (
                      <div className="p-12 text-center text-gray-400 bg-white rounded-xl border border-gray-200 border-dashed">
                          <span className="material-icons text-3xl mb-2">search_off</span>
                          <p>Tidak ada transaksi yang cocok dengan filter.</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default ReportsView;