
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import InventoryView from './components/InventoryView';
import MembersView from './components/MembersView';
import ChatBot from './components/ChatBot';
import RentalForm from './components/RentalForm';
import RefillView from './components/RefillView';
import DeliveryView from './components/DeliveryView';
import ReportsView from './components/ReportsView';
import Login from './components/Login';
import AdminView from './components/AdminView';
import HistoryView from './components/HistoryView';
import MasterDataView from './components/MasterDataView';
import GasExchangeView, { GasExchangePayload } from './components/GasExchangeView';
import AntrianIsiView, { BayarPesananPayload, BuatPesananPayload, SerahPesananPayload } from './components/AntrianIsiView';
import { NewRentalPayload } from './components/NewRentalForm';
import { Cylinder, Member, Transaction, MemberPrice, CylinderStatus, CylinderSize, RefillStation, RefillPrice, RefillDraft, PenukaranTabung, AppUser, UserRole, MemberStatus, GasPrice, GasOrder, RentalTariff, MetodeBayar } from './types';
import { JENIS_PESANAN } from './lib/antrianIsi';
import { bolehKelolaPengguna } from './lib/peran';
import KasView, { KasPayload } from './components/KasView';
import { PengeluaranPayload } from './lib/pengeluaran';
import BonView, { BayarBonPayload, TambahBonPayload } from './components/BonView';
import { supabase, isSupabaseConfigured, fetchAllRecords } from './lib/supabase';

/**
 * Baris tabel profiles apa adanya.
 *
 * Kolomnya bernama `username` tapi isinya email -- trigger handle_new_user
 * mengisinya dari auth.users.email. Nama kolomnya dibiarkan supaya tidak perlu
 * migration; yang dipetakan cuma bentuknya saat masuk ke app.
 */
interface BarisProfil {
  id: string;
  username: string | null;
  name: string | null;
  role: string | null;
  lastLogin?: string | null;
}

const keAppUser = (baris: BarisProfil): AppUser => ({
  id: baris.id,
  email: baris.username || '',
  name: baris.name || 'Tanpa Nama',
  role: (baris.role as UserRole) || UserRole.Operator,
  lastLogin: baris.lastLogin || undefined,
});

/**
 * Baris uang sebuah pesanan antrian isi.
 *
 * Satu-satunya baris pesanan yang bernominal; baris barangnya selalu nol. Bentuknya
 * dijadikan satu fungsi karena dipakai tiga jalur yang berjauhan -- bayar di muka,
 * bayar belakangan, dan bayar saat penyerahan -- dan ketiganya harus menghasilkan
 * baris yang persis sama supaya laporan tidak membedakan uang yang datang lebih awal
 * dari uang yang datang terlambat.
 *
 * Bon pesanan diperlakukan sama dengan sewa kredit yang sudah berjalan: tetap
 * terhitung pemasukan hari itu, tapi masuk kelompok "Belum Dibayar" di rekap metode
 * bayar. Mengeluarkannya dari pendapatan akan membuat rincian per metode tidak pernah
 * cocok dengan kartu Pemasukan -- lihat lib/metodeBayar.ts.
 */
const barisBayarPesanan = (
  pesanan: GasOrder,
  bayar: { jumlah: number; metodeBayar?: MetodeBayar; bon?: boolean },
  tanggal: string
): Transaction => ({
  id: `t-antri-bayar-${Date.now()}`,
  memberId: pesanan.memberId || undefined,
  type: 'ORDER_PAYMENT',
  date: tanggal,
  cost: bayar.jumlah,
  paymentStatus: bayar.bon ? 'UNPAID' : 'PAID',
  // Kosong untuk bon, sama seperti sewa kredit: uangnya belum berpindah, jadi belum
  // ada metodenya.
  paymentMethod: bayar.bon ? undefined : bayar.metodeBayar,
  description: `${JENIS_PESANAN[pesanan.jenis] || pesanan.jenis} - ${pesanan.namaPembeli}`,
});

const App: React.FC = () => {
  // -- Configuration Guard --
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-icons text-3xl">settings_alert</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Konfigurasi Diperlukan</h1>
          <p className="text-gray-500 mb-6">
            Aplikasi tidak bisa terhubung ke Supabase. Atur variabel lingkungan terlebih dahulu untuk melanjutkan.
          </p>

          <div className="bg-slate-900 rounded-lg p-4 text-left overflow-x-auto mb-6">
            <p className="text-slate-400 text-xs uppercase font-bold mb-2">.env / Variabel Lingkungan</p>
            <code className="text-green-400 text-sm font-mono block mb-1">VITE_SUPABASE_URL=your_project_url</code>
            <code className="text-green-400 text-sm font-mono block">VITE_SUPABASE_ANON_KEY=your_anon_key</code>
          </div>

          <p className="text-sm text-gray-400">
            Kalau menjalankan secara lokal, buat berkas <span className="font-mono bg-gray-100 px-1 rounded">.env</span> di folder utama proyek.
          </p>
        </div>
      </div>
    );
  }

  // -- Auth State --
  const [currentUser, setCurrentUser] = useState<AppUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // -- Data State --
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [memberPrices, setMemberPrices] = useState<MemberPrice[]>([]);
  const [gasPrices, setGasPrices] = useState<GasPrice[]>([]);
  const [refillStations, setRefillStations] = useState<RefillStation[]>([]);
  const [refillPrices, setRefillPrices] = useState<RefillPrice[]>([]);
  const [refillDrafts, setRefillDrafts] = useState<RefillDraft[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]); // For Admin View
  const [tariffs, setTariffs] = useState<RentalTariff[]>([]);
  const [gasOrders, setGasOrders] = useState<GasOrder[]>([]);

  // -- 1. FETCH INITIAL DATA --
  const fetchData = async () => {
    try {
      // Fetch all records from all tables concurrently using the paginated helper
      const [
        cylData,
        memData,
        txData,
        mpData,
        gpData,
        rsData,
        rpData,
        prData,
        rtData,
        rdData,
        goData
      ] = await Promise.all([
        fetchAllRecords<Cylinder>('cylinders'),
        fetchAllRecords<Member>('members'),
        // Transaksi yang dibatalkan disaring di sini, satu-satunya pintu masuk data.
        // Stok, barang di tangan pelanggan, dan seluruh laporan diturunkan dari array
        // ini, jadi menyaringnya sekali membuat semuanya ikut benar.
        fetchAllRecords<Transaction>('transactions', '*', q => q.is('voidedAt', null)),
        fetchAllRecords<MemberPrice>('member_prices'),
        fetchAllRecords<GasPrice>('refill_prices'),
        fetchAllRecords<RefillStation>('refill_stations'),
        fetchAllRecords<RefillPrice>('refill_prices'),
        fetchAllRecords<BarisProfil>('profiles'),
        fetchAllRecords<RentalTariff>('rental_tariffs'),
        // Tanpa kolom `id` -- barisnya berkunci "stationId", satu draf per vendor.
        fetchAllRecords<RefillDraft>('refill_drafts', '*', undefined, 'stationId'),
        fetchAllRecords<GasOrder>('gas_orders')
      ]);

      if (cylData) setCylinders(cylData);
      if (memData) setMembers(memData);
      if (txData) setTransactions(txData);
      if (mpData) setMemberPrices(mpData);
      if (gpData) setGasPrices(gpData);
      if (rsData) setRefillStations(rsData);
      if (rpData) setRefillPrices(rpData);
      if (prData) setUsers(prData.map(keAppUser));
      if (rtData) setTariffs(rtData);
      if (rdData) setRefillDrafts(rdData);
      if (goData) setGasOrders(goData);

    } catch (error) {
      console.error("Error fetching data:", error);
    }
  };

  // Check active session on mount
  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        // Fetch profile
        const { data: profile } = await supabase.from('profiles').select('*').eq('id', session.user.id).single();
        if (profile) {
          setCurrentUser({
            id: profile.id,
            email: profile.username || session.user.email || '',
            name: profile.name || 'User',
            role: profile.role as UserRole || UserRole.Operator,
            lastLogin: new Date().toISOString()
          });
          await fetchData();
        }
      }
      setIsLoading(false);
    };
    checkSession();
  }, []);

  // -- Auth Handlers --
  const handleLogin = async (email: string, pass: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password: pass
      });

      if (error || !data.user) {
        console.error("Login failed:", error);
        return false;
      }

      const { data: profile } = await supabase.from('profiles').select('*').eq('id', data.user.id).single();

      if (profile) {
        const userObj: AppUser = {
          id: profile.id,
          email: profile.username || email,
          name: profile.name || 'User',
          role: profile.role as UserRole,
          lastLogin: new Date().toISOString()
        };
        setCurrentUser(userObj);
        await fetchData(); // Load data after login
        return true;
      }
      return false;
    } catch (e) {
      console.error(e);
      return false;
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setCurrentUser(null);
    // Clear data
    setCylinders([]);
    setMembers([]);
    setTransactions([]);
  };

  // -- User CRUD Handlers (Admin Only) --

  /**
   * Membuat dan menghapus akun menyentuh auth.users, yang cuma bisa disentuh
   * service_role key -- dan key itu tidak boleh ada di browser. Keduanya dititipkan
   * ke Edge Function kelola-pengguna, yang memeriksa ulang bahwa pemanggilnya Admin.
   */
  const panggilKelolaPengguna = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('kelola-pengguna', { body });

    // Status non-2xx datang sebagai FunctionsHttpError dengan pesan generik
    // ("non-2xx status code"); alasan sebenarnya ada di body responsnya.
    if (error) {
      const detail = await (error as any).context?.json?.().catch(() => null);
      throw new Error(detail?.error || error.message);
    }
    if (data?.error) throw new Error(data.error);

    return data;
  };

  const handleAddUser = async (user: AppUser) => {
    const hasil = await panggilKelolaPengguna({
      aksi: 'tambah',
      email: user.email,
      nama: user.name,
      password: user.password,
      peran: user.role,
    });

    setUsers(prev => [...prev, { ...user, id: hasil.id, password: undefined }]);
  };

  const handleUpdateUser = async (user: AppUser) => {
    // Nama dan peran ada di profiles, jadi cukup lewat RLS biasa. Email dan kata
    // sandi ada di auth.users dan tidak diubah dari sini.
    const { error } = await supabase
      .from('profiles')
      .update({ role: user.role, name: user.name })
      .eq('id', user.id);

    if (error) throw new Error(`Gagal menyimpan perubahan: ${error.message}`);

    setUsers(prev => prev.map(u => u.id === user.id ? { ...u, name: user.name, role: user.role } : u));
  };

  const handleDeleteUser = async (id: string) => {
    await panggilKelolaPengguna({ aksi: 'hapus', id });
    setUsers(prev => prev.filter(u => u.id !== id));
  };


  // -- CRUD Handlers for Cylinders --
  const handleAddCylinder = async (newCyl: Cylinder) => {
    const { error } = await supabase.from('cylinders').insert(newCyl);
    if (!error) setCylinders(prev => [...prev, newCyl]);
  };

  const handleBulkAddCylinder = async (newCylinders: Cylinder[]) => {
    const { error } = await supabase.from('cylinders').insert(newCylinders);
    if (!error) setCylinders(prev => [...prev, ...newCylinders]);
  };

  const handleUpdateCylinder = async (updatedCyl: Cylinder) => {
    const { error } = await supabase.from('cylinders').update(updatedCyl).eq('id', updatedCyl.id);
    if (!error) setCylinders(prev => prev.map(c => c.id === updatedCyl.id ? updatedCyl : c));
  };

  const handleDeleteCylinder = async (id: string) => {
    const { error } = await supabase.from('cylinders').delete().eq('id', id);
    if (!error) setCylinders(prev => prev.filter(c => c.id !== id));
  };

  // -- CRUD Handlers for Members --
  const handleAddMember = async (newMember: Member) => {
    const { error } = await supabase.from('members').insert(newMember);
    if (!error) setMembers(prev => [...prev, newMember]);
  };

  const handleUpdateMember = async (updatedMember: Member) => {
    const { error } = await supabase.from('members').update(updatedMember).eq('id', updatedMember.id);
    if (!error) setMembers(prev => prev.map(m => m.id === updatedMember.id ? updatedMember : m));
  };

  const handleDeleteMember = async (id: string) => {
    const { error } = await supabase.from('members').delete().eq('id', id);
    if (!error) setMembers(prev => prev.filter(m => m.id !== id));
  };

  /**
   * Pembayaran bon, baik dicicil maupun dilunasi sekaligus.
   *
   * `opsi` menampung dua hal yang hanya dipakai halaman Bon: tanggal uangnya
   * benar-benar diterima (bon sering dibayar saat pelanggan mampir, dan baru
   * dicatat kemudian), dan catatan singkat untuk membedakan cicilan yang
   * berulang. Keduanya opsional supaya pemanggil lama di detail pelanggan tidak
   * perlu ikut berubah.
   */
  const handlePayDebt = async (
    memberId: string,
    amount: number,
    billIds: string[],
    opsi?: { date?: string; description?: string }
  ) => {
    const member = members.find(m => m.id === memberId);
    if (!member) throw new Error('Pelanggan tidak ditemukan.');

    const newDebt = Math.max(0, member.totalDebt - amount);

    // 1. Update Member
    // Kegagalan dilempar, bukan didiamkan: halaman Bon menampilkan pesan berhasil
    // begitu fungsi ini selesai, jadi error yang ditelan berarti petugas mengira
    // uangnya sudah tercatat padahal tidak.
    const { error: errMember } = await supabase.from('members').update({ totalDebt: newDebt }).eq('id', memberId);
    if (errMember) throw new Error(errMember.message);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, totalDebt: newDebt } : m));

    // 2. Mark Bills Paid
    if (billIds.length > 0) {
      await supabase.from('transactions').update({ paymentStatus: 'PAID' }).in('id', billIds);
      setTransactions(prev => prev.map(t => billIds.includes(t.id) ? { ...t, paymentStatus: 'PAID' } : t));
    }

    // 3. Log Transaction
    const newTx: Transaction = {
      id: `t-pay-${Date.now()}`,
      memberId: memberId,
      type: 'DEBT_PAYMENT',
      date: opsi?.date || new Date().toISOString(),
      cost: amount,
      paymentStatus: 'PAID',
      relatedTransactionIds: billIds,
      description: opsi?.description
    };
    const { error: errTx } = await supabase.from('transactions').insert(newTx);
    if (errTx) throw new Error(errTx.message);
    setTransactions(prev => [...prev, newTx]);
  };

  /**
   * Mencatat bon yang tidak lahir dari sewa atau tukar isi di sistem ini.
   *
   * Yang ditampung terutama tagihan yang sudah berjalan di buku sebelum sistem
   * dipakai. Barisnya sengaja tidak dihitung sebagai pendapatan (lihat
   * barisPendapatan di lib/laporanHarian.ts): barangnya sudah terjual entah kapan,
   * jadi memasukkannya ke laporan hari ini akan mengarang omzet. Yang dicatat di
   * sini murni piutang; sewa kredit yang baru tetap lewat halaman Tukar Besar &
   * Sewa supaya penjualannya ikut terhitung.
   */
  const handleTambahBon = async (memberId: string, amount: number, date: string) => {
    const member = members.find(m => m.id === memberId);
    if (!member) throw new Error('Pelanggan tidak ditemukan.');

    const newTx: Transaction = {
      id: `t-bon-${Date.now()}`,
      memberId,
      type: 'DEBT_ADD',
      date,
      cost: amount,
      paymentStatus: 'UNPAID'
    };

    const { error: errTx } = await supabase.from('transactions').insert(newTx);
    if (errTx) throw new Error(errTx.message);

    // Baru setelah barisnya tersimpan: kalau urutannya dibalik dan insert gagal,
    // yang tertinggal adalah angka bon tanpa asal-usul -- persis kekacauan yang
    // baru saja dibersihkan lewat migrasi nolkan_bon_sisa.
    const newDebt = (member.totalDebt || 0) + amount;
    const { error: errMember } = await supabase.from('members')
      .update({ totalDebt: newDebt })
      .eq('id', memberId);
    if (errMember) throw new Error(errMember.message);

    setTransactions(prev => [...prev, newTx]);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, totalDebt: newDebt } : m));
  };

  /**
   * Menghapus bon yang salah catat -- seluruh sisa milik satu pelanggan.
   *
   * Seluruh kerjanya di fungsi hapus_bon() di database, bukan di sini. Dua alasan
   * yang keduanya mengikat: penghapusan ini menyentuh members dan banyak baris
   * transactions sekaligus, dan yang lebih penting, penjagaan "hanya Administrator"
   * harus diperiksa di tempat yang tidak bisa dilewati. Policy RLS memberi setiap
   * akun yang login akses penuh ke kedua tabel itu, jadi memeriksanya di browser
   * cuma menyembunyikan tombol, bukan menutup pintunya.
   */
  const handleHapusBon = async (memberId: string, alasan: string) => {
    const { error } = await supabase.rpc('hapus_bon', { p_member_id: memberId, p_alasan: alasan });
    if (error) throw new Error(error.message);

    await fetchData();
  };

  /** Sama, tapi hanya satu baris tagihan. */
  const handleHapusBarisBon = async (transactionId: string, alasan: string) => {
    const { error } = await supabase.rpc('hapus_baris_bon', { p_id: transactionId, p_alasan: alasan });
    if (error) throw new Error(error.message);

    await fetchData();
  };

  const handleMemberExitRequest = async (memberId: string) => {
    const updates = { status: MemberStatus.Pending_Exit, exitRequestDate: new Date().toISOString() };
    await supabase.from('members').update(updates).eq('id', memberId);

    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...updates } : m));
  };

  const handleMemberRefund = async (memberId: string, refundAmount: number) => {
    // 1. Transaction
    const newTx: Transaction = {
      id: `t-refund-${Date.now()}`,
      memberId: memberId,
      type: 'DEPOSIT_REFUND',
      date: new Date().toISOString(),
      cost: refundAmount,
      paymentStatus: 'PAID'
    };
    await supabase.from('transactions').insert(newTx);

    // 2. Update Member
    const updates = { status: MemberStatus.Non_Active, totalDeposit: 0 };
    await supabase.from('members').update(updates).eq('id', memberId);

    setTransactions(prev => [...prev, newTx]);
    setMembers(prev => prev.map(m => m.id === memberId ? { ...m, ...updates } : m));
  };

  // -- CRUD Handlers for Refill Stations --
  const handleAddStation = async (newStation: RefillStation) => {
    await supabase.from('refill_stations').insert(newStation);
    setRefillStations(prev => [...prev, newStation]);
  };

  const handleUpdateStation = async (updatedStation: RefillStation) => {
    await supabase.from('refill_stations').update(updatedStation).eq('id', updatedStation.id);
    setRefillStations(prev => prev.map(s => s.id === updatedStation.id ? updatedStation : s));
  };

  const handleDeleteStation = async (id: string) => {
    await supabase.from('refill_stations').delete().eq('id', id);
    setRefillStations(prev => prev.filter(s => s.id !== id));
    setRefillPrices(prev => prev.filter(p => p.stationId !== id));
    // Barisnya sendiri sudah ikut terhapus di database lewat ON DELETE CASCADE.
    setRefillDrafts(prev => prev.filter(d => d.stationId !== id));
  };

  const handleUpdateRefillPrices = async (newPrices: RefillPrice[]) => {
    // Simplistic approach: Upsert all
    await supabase.from('refill_prices').upsert(newPrices);
    setRefillPrices(newPrices);
    // Better to refetch all to ensure full consistency and bypass pagination limits
    const data = await fetchAllRecords<RefillPrice>('refill_prices');
    if (data) setRefillPrices(data);
  };

  // -- Draf Pengiriman Isi Ulang --

  /**
   * Simpan pilihan tabung yang belum final -- satu draf per vendor, selalu ditimpa.
   *
   * Draf tidak menyentuh status tabung maupun transactions: yang tersimpan hanya
   * daftar id pilihannya, supaya bisa dilanjutkan dari perangkat lain atau oleh
   * petugas shift berikutnya. Barangnya baru benar-benar berpindah di
   * handleSendToRefill.
   *
   * Kegagalannya dilempar, tidak ditelan seperti handler lain di berkas ini: petugas
   * yang mengira pilihannya aman lalu menutup halaman kehilangan seluruh pekerjaannya,
   * jadi RefillView harus bisa mengabarkan bahwa penyimpanan gagal.
   */
  const handleSaveRefillDraft = async (stationId: string, cylinderIds: string[]) => {
    const draft: RefillDraft = {
      stationId,
      cylinderIds,
      updatedAt: new Date().toISOString(),
      updatedBy: currentUser?.name
    };

    const { error } = await supabase.from('refill_drafts').upsert(draft);
    if (error) {
      console.error('Gagal menyimpan draf pengiriman:', error);
      throw error;
    }

    setRefillDrafts(prev => [...prev.filter(d => d.stationId !== stationId), draft]);
  };

  const handleDeleteRefillDraft = async (stationId: string) => {
    const { error } = await supabase.from('refill_drafts').delete().eq('stationId', stationId);
    if (error) {
      console.error('Gagal menghapus draf pengiriman:', error);
      throw error;
    }

    setRefillDrafts(prev => prev.filter(d => d.stationId !== stationId));
  };

  // -- Refill Flow Handlers --
  const handleSendToRefill = async (stationId: string, cylinderIds: string[]) => {
    const station = refillStations.find(s => s.id === stationId);
    if (!station) return;
    const date = new Date().toISOString();

    const newTransactions: Transaction[] = cylinderIds.map(id => ({
      id: `t-ref-out-${Date.now()}-${id}`,
      cylinderId: id,
      refillStationId: stationId,
      type: 'REFILL_OUT',
      date: date
    }));

    // Update Cylinders
    await supabase.from('cylinders').update({
      status: CylinderStatus.Refilling,
      currentHolder: null, // 'RefillStation' logical
      lastLocation: station.name,
      heldSince: null // tidak lagi di tangan pelanggan
    }).in('id', cylinderIds);

    // Add Transactions
    await supabase.from('transactions').insert(newTransactions);

    setCylinders(prev => prev.map(c => {
      if (cylinderIds.includes(c.id)) {
        return {
          ...c,
          status: CylinderStatus.Refilling,
          currentHolder: 'RefillStation',
          lastLocation: station.name,
          heldSince: null
        };
      }
      return c;
    }));
    setTransactions(prev => [...prev, ...newTransactions]);

    // Draf vendor ini sudah terwujud jadi pengiriman, jadi tidak ada lagi yang perlu
    // dilanjutkan. Kalau penghapusannya gagal pun pengiriman tetap sah dan tercatat:
    // draf yang tertinggal hanya memuat tabung yang kini berstatus 'Sedang Diisi',
    // dan RefillView memang menyaring isi draf terhadap tabung yang masih layak kirim.
    if (refillDrafts.some(d => d.stationId === stationId)) {
      try {
        await handleDeleteRefillDraft(stationId);
      } catch {
        // sudah dicatat ke console oleh handler-nya
      }
    }
  };

  /**
   * Terima tabung yang pulang dari pabrik -- termasuk yang pulang sebagai tabung lain.
   *
   * `penukaran` memuat tabung yang ditukar pabrik: kode seri lamanya tidak akan pernah
   * kembali, penggantinya kadang belum pernah tercatat sama sekali. Keduanya ikut satu
   * batch biaya yang sama, karena tabung pengganti tetap satu kali isi ulang yang dibayar.
   */
  const handleReceiveFromRefill = async (
    cylinderIds: string[],
    totalCost: number,
    penukaran: PenukaranTabung[] = []
  ) => {
    const jumlahDiterima = cylinderIds.length + penukaran.length;
    if (jumlahDiterima === 0) return;

    const date = new Date().toISOString();
    const costPerUnit = totalCost / jumlahDiterima;

    // Tabung pengganti yang belum pernah tercatat harus lahir lebih dulu:
    // transactions."cylinderId" menunjuk cylinders.id, jadi baris transaksinya ditolak
    // selama tabungnya belum ada.
    const tabungBaru: Cylinder[] = [];
    const idPengganti = new Map<string, string>(); // id tabung lama -> id penggantinya

    penukaran.forEach((p, i) => {
      if (p.penggantiId) {
        idPengganti.set(p.lamaId, p.penggantiId);
        return;
      }
      if (!p.pengganti) return;

      const baru: Cylinder = {
        id: `c-tukar-${Date.now()}-${i}`,
        serialCode: p.pengganti.serialCode,
        gasType: p.pengganti.gasType,
        size: p.pengganti.size,
        status: CylinderStatus.Available,
        lastLocation: 'Gudang Utama',
        heldSince: null
      };
      tabungBaru.push(baru);
      idPengganti.set(p.lamaId, baru.id);
    });

    // Satu-satunya langkah di alur ini yang errornya tidak boleh ditelan: kalau tabung
    // pengganti gagal masuk sementara tabung lama sudah ditutup, gudang kehilangan
    // catatan tabung yang benar-benar ada di rak.
    if (tabungBaru.length > 0) {
      const { error } = await supabase.from('cylinders').insert(tabungBaru);
      if (error) {
        console.error('Gagal mendaftarkan tabung pengganti:', error);
        throw error;
      }
    }

    const idDiterima = [...cylinderIds, ...idPengganti.values()];
    const idLama = penukaran.map(p => p.lamaId);

    await supabase.from('cylinders').update({
      status: CylinderStatus.Available,
      currentHolder: null,
      lastLocation: 'Gudang Utama',
      heldSince: null
    }).in('id', idDiterima);

    if (idLama.length > 0) {
      await supabase.from('cylinders').update({
        status: CylinderStatus.Unknown,
        currentHolder: null,
        lastLocation: 'Tukar Tabung Lain',
        heldSince: null
      }).in('id', idLama);
    }

    const seri = (id: string) =>
      cylinders.find(c => c.id === id)?.serialCode
      ?? tabungBaru.find(c => c.id === id)?.serialCode
      ?? id;

    const newTransactions: Transaction[] = [
      ...cylinderIds.map(id => ({
        id: `t-ref-in-${Date.now()}-${id}`,
        cylinderId: id,
        type: 'REFILL_IN' as const,
        date: date,
        cost: costPerUnit
      })),
      ...penukaran.flatMap(p => {
        const baruId = idPengganti.get(p.lamaId);
        if (!baruId) return [];

        return [
          {
            id: `t-ref-in-${Date.now()}-${baruId}`,
            cylinderId: baruId,
            type: 'REFILL_IN' as const,
            date: date,
            cost: costPerUnit,
            description: `Pengganti tabung ${seri(p.lamaId)}`
          },
          // Tanpa nominal: uangnya sudah tercatat di baris tabung penggantinya, dan
          // baris ini cuma menjelaskan ke mana perginya tabung lama.
          {
            id: `t-tukar-${Date.now()}-${p.lamaId}`,
            cylinderId: p.lamaId,
            type: 'CYLINDER_SWAP' as const,
            date: date,
            description: `Ditukar pabrik dengan ${seri(baruId)}`
          }
        ];
      })
    ];

    await supabase.from('transactions').insert(newTransactions);

    setCylinders(prev => [
      ...prev.map(c => {
        if (idDiterima.includes(c.id)) {
          return {
            ...c,
            status: CylinderStatus.Available,
            currentHolder: undefined,
            lastLocation: 'Gudang Utama',
            heldSince: null
          };
        }
        if (idLama.includes(c.id)) {
          return {
            ...c,
            status: CylinderStatus.Unknown,
            currentHolder: undefined,
            lastLocation: 'Tukar Tabung Lain',
            heldSince: null
          };
        }
        return c;
      }),
      ...tabungBaru
    ]);

    setTransactions(prev => [...prev, ...newTransactions]);
  };

  // -- Delivery Handler --
  const handleDeliverCylinders = async (cylinderIds: string[], dateStr: string) => {
    const formattedDate = new Date(dateStr).toISOString();

    const newTransactions: Transaction[] = cylinderIds.map(id => ({
      id: `t-del-${Date.now()}-${id}`,
      cylinderId: id,
      type: 'DELIVERY',
      date: formattedDate
    }));

    // Update Cylinders
    await supabase.from('cylinders').update({
      status: CylinderStatus.Delivery,
      lastLocation: 'In Transit'
    }).in('id', cylinderIds);

    // Add Transactions
    await supabase.from('transactions').insert(newTransactions);

    // Update Local State
    setCylinders(prev => prev.map(c => {
      if (cylinderIds.includes(c.id)) {
        return {
          ...c,
          status: CylinderStatus.Delivery,
          lastLocation: 'In Transit'
        };
      }
      return c;
    }));
    setTransactions(prev => [...prev, ...newTransactions]);
  };

  /**
   * Sewa baru: daftarkan pelanggan (atau pakai yang sudah ada) sekaligus catat
   * sewa pertamanya, termasuk deposit jaminan dan regulator.
   *
   * Nominal tarif sudah disalin ke tiap item oleh form, jadi yang tersimpan di
   * transaksi adalah angka saat itu -- mengubah master data nanti tidak akan
   * menulis ulang riwayat ini.
   *
   * cost sengaja hanya berisi pendapatan (sewa + gas + regulator). Deposit masuk
   * kolom depositAmount supaya Laporan Keuangan tidak melaporkan titipan sebagai laba.
   */
  const handleNewRental = async (payload: NewRentalPayload) => {
    const { isNewMember, member, rentalDate, items, totals, metodeBayar } = payload;

    // -- 1. Pelanggan --
    let memberId = member.id || '';

    if (isNewMember) {
      memberId = `m-${Date.now()}`;
      const baru: Member & { ktp?: string } = {
        id: memberId,
        name: member.name,
        companyName: member.name,
        address: member.address,
        phone: member.phone,
        ktp: member.ktp,
        totalDeposit: totals.deposit,
        totalDebt: 0,
        joinDate: rentalDate,
        status: MemberStatus.Active,
      };
      const { error } = await supabase.from('members').insert(baru);
      if (error) {
        // Index unik parsial pada ktp: nomor yang sama tidak boleh didaftarkan dua kali.
        throw new Error(
          error.code === '23505'
            ? `KTP ${member.ktp} sudah terdaftar atas pelanggan lain.`
            : `Gagal menyimpan pelanggan: ${error.message}`
        );
      }
    } else {
      const lama = members.find(m => m.id === memberId);
      const depositBaru = (lama?.totalDeposit || 0) + totals.deposit;
      const { error } = await supabase.from('members').update({ totalDeposit: depositBaru }).eq('id', memberId);
      if (error) throw new Error(`Gagal memperbarui deposit pelanggan: ${error.message}`);
    }

    // -- 2. Harga gas jadi harga tetap pelanggan --
    // Satu baris per kombinasi jenis gas + ukuran; kalau pelanggan menyewa dua
    // tabung sejenis, harga terakhir yang dipakai.
    const hargaUnik = new Map<string, { gasType: string; size: string; price: number }>();
    items.forEach(i => hargaUnik.set(`${i.gasType}|${i.size}`, { gasType: i.gasType, size: i.size, price: i.gasPrice }));

    const barisHarga = [...hargaUnik.values()].map((h, idx) => ({
      id: `mp-${Date.now()}-${idx}`,
      memberId,
      gasType: h.gasType,
      size: h.size,
      price: h.price,
    }));

    for (const baris of barisHarga) {
      const adaLama = memberPrices.find(
        p => p.memberId === memberId && p.gasType === baris.gasType && p.size === baris.size
      );
      if (adaLama) {
        await supabase.from('member_prices').update({ price: baris.price }).eq('id', adaLama.id);
      } else {
        await supabase.from('member_prices').insert(baris);
      }
    }

    // -- 3. Tabung berkode berpindah ke pelanggan --
    //
    // currentHolder diisi ID pelanggan, bukan namanya. Perhitungan barang di tangan
    // pelanggan mencocokkan dengan ID (hitungSemuaHolding di lib/memberExit.ts),
    // jadi selama ini tabung yang disewakan lewat layar ini tidak pernah terhitung
    // sebagai barang yang dipegang pelanggan -- dan tidak pernah muncul saat
    // pelanggannya hendak keluar.
    const cylinderIds = items.map(i => i.cylinderId).filter(Boolean) as string[];
    if (cylinderIds.length) {
      const { error: errCyl } = await supabase.from('cylinders').update({
        status: CylinderStatus.Rented,
        currentHolder: memberId,
        // Payload Sewa Baru tidak membawa companyName; untuk pelanggan lama diambil
        // dari data yang sudah ada, untuk yang baru companyName memang disalin
        // dari namanya (lihat pembuatan `baru` di atas).
        lastLocation: members.find(m => m.id === memberId)?.companyName || member.name,
        // Tanggal sewa, bukan tanggal input: sewa yang dicatat menyusul tetap
        // terhitung sejak tabungnya benar-benar keluar.
        heldSince: rentalDate.slice(0, 10),
      }).in('id', cylinderIds);
      if (errCyl) throw new Error(`Gagal memperbarui status tabung: ${errCyl.message}`);
    }

    // -- 3b. Botol tanpa kode: kurangi jumlah stok yang dimiliki toko --
    // Botolnya pergi bersama pelanggan, jadi kepemilikan toko berkurang. Berbeda
    // dengan tukar isi, yang tidak menggerakkan angka ini sama sekali.
    for (const item of items.filter(i => !i.cylinderId)) {
      const tarif = tariffs.find(t => t.kind === 'CYLINDER' && t.gasType === item.gasType && t.size === item.size);
      if (!tarif) continue;
      const sisa = Math.max(0, (tarif.stockQty || 0) - item.quantity);
      const { error } = await supabase.from('rental_tariffs').update({ stockQty: sisa }).eq('id', tarif.id);
      if (error) throw new Error(`Gagal memperbarui stok ${item.gasType} ${item.size}: ${error.message}`);
    }

    // -- 4. Regulator terjual: kepemilikan stok baru berkurang permanen --
    // Regulator sewaan TIDAK menyentuh regulatorUsedStock -- itu perputaran,
    // bukan kepemilikan; yang sedang beredar diturunkan dari transaksi.
    const regulatorTerjual = items.filter(i => i.regulatorSold && i.regulatorTariffId);
    for (const item of regulatorTerjual) {
      const tarif = tariffs.find(t => t.id === item.regulatorTariffId);
      if (!tarif) continue;
      const sisa = Math.max(0, (tarif.regulatorNewStock || 0) - 1);
      const { error } = await supabase.from('rental_tariffs').update({ regulatorNewStock: sisa }).eq('id', tarif.id);
      if (error) throw new Error(`Gagal memperbarui stok regulator baru: ${error.message}`);
    }

    // -- 5. Transaksi, satu per tabung, rincian dibekukan --
    // Nominal pada item berlaku per botol; baris curah dikalikan jumlahnya.
    const newTransactions: Transaction[] = items.map((i, idx) => ({
      id: `t-new-${Date.now()}-${idx}`,
      cylinderId: i.cylinderId,
      memberId,
      type: 'RENTAL_OUT',
      date: rentalDate,
      cost: (i.rentalFee + i.gasPrice) * i.quantity + (i.regulatorFee || 0) + (i.regulatorSalePrice || 0),
      paymentStatus: 'PAID',
      paymentMethod: metodeBayar,
      depositAmount: i.depositAmount * i.quantity,
      rentalFee: i.rentalFee * i.quantity,
      gasPrice: i.gasPrice * i.quantity,
      regulatorFee: i.regulatorFee,
      regulatorSalePrice: i.regulatorSalePrice,
      regulatorTariffId: i.regulatorTariffId,
      regulatorQty: i.regulatorTariffId ? 1 : undefined,
      quantity: i.quantity,
      size: i.size as CylinderSize,
    }));

    const { error: errTx } = await supabase.from('transactions').insert(newTransactions);
    if (errTx) throw new Error(`Gagal mencatat transaksi: ${errTx.message}`);

    await fetchData();
  };

  /**
   * Tukar isi tabung tanpa kode.
   *
   * Tidak menyentuh stok sama sekali: botol masuk satu, keluar satu, jadi jumlah
   * kepemilikan toko tetap. Yang dicatat hanya pendapatan gasnya. memberId boleh
   * kosong -- siapa pun boleh menukar isi, tidak harus pelanggan terdaftar.
   */
  const handleGasExchange = async (payload: GasExchangePayload) => {
    const tx: Transaction = {
      id: `t-tukar-${Date.now()}`,
      memberId: payload.memberId,
      type: 'GAS_EXCHANGE',
      date: payload.date,
      cost: payload.pricePerUnit * payload.quantity,
      paymentStatus: 'PAID',
      paymentMethod: payload.metodeBayar,
      quantity: payload.quantity,
      size: payload.size,
      gasPrice: payload.pricePerUnit,
    };

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw new Error(`Gagal mencatat tukar isi: ${error.message}`);

    setTransactions(prev => [...prev, tx]);
  };

  /**
   * Mencatat pesanan yang isinya belum bisa diserahkan.
   *
   * Urutan tulisnya disengaja: baris pesanan lebih dulu -- dengan pengait transaksi
   * masih kosong -- baru barangnya, uangnya, dan terakhir pengaitnya diisi. Kalau
   * putus di tengah, yang tertinggal adalah pesanan yang kelihatan di layar dan bisa
   * dibatalkan, bukan tabung yang berpindah tanpa asal-usul. Alasan yang sama dengan
   * urutan di handleTambahBon.
   *
   * Hanya tukar besar yang menggerakkan barang. Tabung titipan bukan aset toko dan
   * tidak pernah masuk cylinders; botol curah tidak menggerakkan stok karena stockQty
   * adalah angka kepemilikan, dan kepemilikan memang tidak berubah saat botol kosong
   * menginap di rak. Untuk keduanya, kartu pesanan adalah satu-satunya catatan.
   */
  const handleBuatPesanan = async (p: BuatPesananPayload) => {
    if (p.jenis === 'TUKAR_BESAR' && (!p.memberId || !p.cylinderMasukId)) {
      throw new Error('Tukar besar butuh pelanggan terdaftar dan tabung yang ditaruh.');
    }

    const id = `p-${Date.now()}`;
    const member = p.memberId ? members.find(m => m.id === p.memberId) : undefined;

    const pesanan: GasOrder = {
      id,
      jenis: p.jenis,
      status: 'MENUNGGU',
      memberId: p.memberId || null,
      namaPembeli: p.namaPembeli || member?.companyName || 'Pembeli Lepas',
      gasType: p.gasType || null,
      size: p.size || null,
      quantity: p.quantity || 1,
      cylinderMasukId: p.cylinderMasukId || null,
      cylinderKeluarId: null,
      serialTitipan: p.serialTitipan || null,
      harga: p.harga ?? null,
      transaksiBayarId: null,
      transaksiTerimaId: null,
      transaksiSerahId: null,
      catatan: p.catatan || null,
      alasanBatal: null,
      tanggalMasuk: p.tanggal,
      tanggalSelesai: null,
      dibuatOleh: currentUser?.name || null,
    };

    const { error } = await supabase.from('gas_orders').insert(pesanan);
    if (error) throw new Error(`Gagal mencatat pesanan: ${error.message}`);

    const transaksiBaru: Transaction[] = [];
    const kait: Partial<GasOrder> = {};

    if (p.jenis === 'TUKAR_BESAR' && p.cylinderMasukId && p.memberId) {
      // Tabung kosongnya benar-benar masuk gudang, jadi statusnya berubah persis
      // seperti pengembalian biasa -- itu yang membuatnya langsung muncul di halaman
      // Pabrik dan di antrian tindakan Beranda.
      const { error: errTabung } = await supabase.from('cylinders').update({
        status: CylinderStatus.EmptyRefill,
        currentHolder: null,
        lastLocation: 'Gudang Utama',
        heldSince: null,
      }).eq('id', p.cylinderMasukId);
      if (errTabung) throw new Error(`Gagal memperbarui tabung: ${errTabung.message}`);

      const txTerima: Transaction = {
        id: `t-antri-masuk-${Date.now()}`,
        cylinderId: p.cylinderMasukId,
        memberId: p.memberId,
        type: 'RETURN',
        date: p.tanggal,
      };
      transaksiBaru.push(txTerima);
      kait.transaksiTerimaId = txTerima.id;
    }

    if (p.bayarSekarang && p.bayarSekarang.jumlah > 0) {
      const txBayar = barisBayarPesanan(pesanan, p.bayarSekarang, p.tanggal);
      transaksiBaru.push(txBayar);
      kait.transaksiBayarId = txBayar.id;
    }

    if (transaksiBaru.length > 0) {
      const { error: errTx } = await supabase.from('transactions').insert(transaksiBaru);
      if (errTx) throw new Error(`Gagal mencatat transaksi: ${errTx.message}`);

      const { error: errKait } = await supabase.from('gas_orders').update(kait).eq('id', id);
      if (errKait) throw new Error(`Gagal menyambungkan transaksi ke pesanan: ${errKait.message}`);
    }

    setGasOrders(prev => [...prev, { ...pesanan, ...kait }]);
    setTransactions(prev => [...prev, ...transaksiBaru]);

    if (p.jenis === 'TUKAR_BESAR' && p.cylinderMasukId) {
      setCylinders(prev => prev.map(c => c.id === p.cylinderMasukId
        ? { ...c, status: CylinderStatus.EmptyRefill, currentHolder: undefined, lastLocation: 'Gudang Utama', heldSince: null }
        : c));
    }
  };

  /**
   * Pembayaran yang datang belakangan, saat isinya masih belum diserahkan.
   *
   * Tanggalnya diminta ke petugas, bukan diambil dari jam sekarang: pelanggan sering
   * membayar saat mampir dan barisnya baru dicatat kemudian, dan seluruh gunanya
   * memisahkan uang dari barang adalah supaya tanggal uangnya benar.
   */
  const handleBayarPesanan = async (p: BayarPesananPayload) => {
    const pesanan = gasOrders.find(o => o.id === p.pesananId);
    if (!pesanan) throw new Error('Pesanan tidak ditemukan.');
    if (pesanan.transaksiBayarId) throw new Error('Pesanan ini sudah punya catatan pembayaran.');

    const tx = barisBayarPesanan(pesanan, { jumlah: p.jumlah, metodeBayar: p.metodeBayar }, p.tanggal);

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw new Error(`Gagal mencatat pembayaran: ${error.message}`);

    // Harga ikut disamakan dengan yang benar-benar dibayar -- sebelum ini isinya
    // taksiran, dan taksiran yang tertinggal berbeda dari nominal yang tercatat cuma
    // menimbulkan pertanyaan yang tidak ada jawabannya.
    const kait = { transaksiBayarId: tx.id, harga: p.jumlah };
    const { error: errKait } = await supabase.from('gas_orders').update(kait).eq('id', p.pesananId);
    if (errKait) throw new Error(`Gagal menyambungkan pembayaran ke pesanan: ${errKait.message}`);

    setTransactions(prev => [...prev, tx]);
    setGasOrders(prev => prev.map(o => (o.id === p.pesananId ? { ...o, ...kait } : o)));
  };

  /**
   * Menyerahkan isi -- pesanannya selesai.
   *
   * Baris barangnya bernominal nol. Uangnya punya barisnya sendiri, dan kalau memang
   * sudah dibayar sebelumnya, hari ini tidak ada uang yang dicatat sama sekali.
   */
  const handleSerahkanPesanan = async (p: SerahPesananPayload) => {
    const pesanan = gasOrders.find(o => o.id === p.pesananId);
    if (!pesanan) throw new Error('Pesanan tidak ditemukan.');

    const date = new Date().toISOString();

    // Penutupan status dijadikan penjaga, bukan sekadar penanda: dua petugas yang
    // menekan Serahkan bersamaan akan menyerahkan dua tabung untuk satu pesanan.
    // Yang kalah balapan tidak mendapat baris apa pun dan berhenti di sini, sebelum
    // ada satu pun transaksi tertulis.
    const { data: terkunci, error: errKunci } = await supabase.from('gas_orders')
      .update({ status: 'SELESAI', tanggalSelesai: date })
      .eq('id', p.pesananId)
      .eq('status', 'MENUNGGU')
      .select();
    if (errKunci) throw new Error(`Gagal menutup pesanan: ${errKunci.message}`);
    if (!terkunci || terkunci.length === 0) {
      throw new Error('Pesanan ini sudah diselesaikan atau dibatalkan lebih dulu.');
    }

    const member = pesanan.memberId ? members.find(m => m.id === pesanan.memberId) : undefined;
    const transaksiBaru: Transaction[] = [];
    const kait: Partial<GasOrder> = { status: 'SELESAI', tanggalSelesai: date };

    if (pesanan.jenis === 'TUKAR_BESAR' && p.cylinderKeluarId && pesanan.memberId) {
      const { error: errTabung } = await supabase.from('cylinders').update({
        status: CylinderStatus.Rented,
        currentHolder: pesanan.memberId,
        lastLocation: member?.companyName || 'Pelanggan',
        heldSince: date.slice(0, 10),
      }).eq('id', p.cylinderKeluarId);
      if (errTabung) throw new Error(`Gagal memperbarui tabung: ${errTabung.message}`);

      const txSerah: Transaction = {
        id: `t-antri-serah-${Date.now()}`,
        cylinderId: p.cylinderKeluarId,
        memberId: pesanan.memberId,
        type: 'RENTAL_OUT',
        date,
      };
      transaksiBaru.push(txSerah);
      kait.cylinderKeluarId = p.cylinderKeluarId;
      kait.transaksiSerahId = txSerah.id;
    }

    if (p.bayar && p.bayar.jumlah > 0 && !pesanan.transaksiBayarId) {
      const txBayar = barisBayarPesanan(pesanan, p.bayar, date);
      transaksiBaru.push(txBayar);
      kait.transaksiBayarId = txBayar.id;
      kait.harga = p.bayar.jumlah;
    }

    if (transaksiBaru.length > 0) {
      const { error: errTx } = await supabase.from('transactions').insert(transaksiBaru);
      if (errTx) throw new Error(`Gagal mencatat transaksi: ${errTx.message}`);
    }

    // Bon dinaikkan setelah barisnya tersimpan, alasan yang sama seperti
    // handleTambahBon: angka bon tanpa asal-usul lebih sulit dibereskan daripada
    // tagihan yang belum terhitung.
    if (p.bayar?.bon && p.bayar.jumlah > 0 && member) {
      const newDebt = (member.totalDebt || 0) + p.bayar.jumlah;
      const { error: errBon } = await supabase.from('members')
        .update({ totalDebt: newDebt })
        .eq('id', member.id);
      if (errBon) throw new Error(`Gagal memperbarui bon: ${errBon.message}`);
      setMembers(prev => prev.map(m => (m.id === member.id ? { ...m, totalDebt: newDebt } : m)));
    }

    const { error: errKait } = await supabase.from('gas_orders').update(kait).eq('id', p.pesananId);
    if (errKait) throw new Error(`Gagal menyambungkan transaksi ke pesanan: ${errKait.message}`);

    setGasOrders(prev => prev.map(o => (o.id === p.pesananId ? { ...o, ...kait } : o)));
    setTransactions(prev => [...prev, ...transaksiBaru]);

    if (p.cylinderKeluarId && pesanan.memberId) {
      setCylinders(prev => prev.map(c => c.id === p.cylinderKeluarId
        ? {
            ...c,
            status: CylinderStatus.Rented,
            currentHolder: pesanan.memberId!,
            lastLocation: member?.companyName || 'Pelanggan',
            heldSince: date.slice(0, 10),
          }
        : c));
    }
  };

  /**
   * Membatalkan pesanan beserta seluruh bagiannya.
   *
   * Dikerjakan fungsi batalkan_pesanan() di database, bukan di sini: satu pesanan bisa
   * menyentuh gas_orders, cylinders, transactions, dan members sekaligus. Menandai
   * pesanannya batal tanpa membalik sisanya meninggalkan tabung yang tercatat di
   * gudang padahal sudah dikembalikan ke pelanggan.
   */
  const handleBatalkanPesanan = async (id: string, alasan: string) => {
    const { error } = await supabase.rpc('batalkan_pesanan', { p_id: id, p_alasan: alasan });
    if (error) throw new Error(error.message);

    await fetchData();
  };

  /**
   * Kas harian: belanja operasional (EXPENSE) dan penjualan lepas (INCOME).
   *
   * Keduanya satu handler karena bentuknya memang satu -- tidak menyentuh tabung,
   * pelanggan, atau stok, hanya uang berpindah dengan keterangan. Barang seperti
   * selang regulator dan kran oksigen dijual putus dan tidak pernah kembali, jadi
   * tidak ada apa pun yang perlu diikuti setelah barisnya tercatat.
   */
  const handleCatatKas = async (payload: KasPayload) => {
    const tx: Transaction = {
      id: `t-${payload.jenis === 'INCOME' ? 'masuk' : 'biaya'}-${Date.now()}`,
      type: payload.jenis,
      date: payload.date,
      cost: payload.amount,
      paymentStatus: 'PAID',
      description: payload.description,
      category: payload.kategori,
      paymentMethod: payload.metodeBayar,
    };

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw new Error(`Gagal mencatat: ${error.message}`);

    setTransactions(prev => [...prev, tx]);
  };

  /**
   * Pengeluaran yang dicatat dari tab Keuangan -- sama persis dengan kas keluar di
   * atas, hanya membawa pos belanjanya. Sengaja menumpang handler yang sama, bukan
   * jalur tersendiri: satu bentuk baris berarti satu tempat yang perlu diperbaiki
   * kalau nanti pencatatannya berubah.
   */
  const handleCatatPengeluaran = (payload: PengeluaranPayload) =>
    handleCatatKas({ jenis: 'EXPENSE', ...payload });

  /**
   * Membatalkan transaksi yang salah catat.
   *
   * Seluruh pembalikannya dikerjakan fungsi batalkan_transaksi() di database, bukan
   * di sini: satu transaksi bisa menyentuh cylinders, members, dan rental_tariffs
   * sekaligus, dan kalau dikerjakan berurutan dari browser, gagal di tengah
   * meninggalkan data separuh terbalik.
   */
  const handleBatalkanTransaksi = async (id: string, alasan: string) => {
    const { error } = await supabase.rpc('batalkan_transaksi', { p_id: id, p_alasan: alasan });
    if (error) throw new Error(error.message);

    // Muat ulang, bukan tebak-tebakan state: efeknya menyebar ke beberapa tabel
    // sekaligus, dan salah menebak satu saja membuat angka di layar berbeda dari
    // yang tersimpan.
    await fetchData();
  };

  const handleHapusKas = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw new Error(`Gagal menghapus catatan: ${error.message}`);

    setTransactions(prev => prev.filter(t => t.id !== id));
  };

  // Handler for rental transactions (Rentals AND Returns)
  const handleRental = async (
    memberId: string,
    rentCylinderIds: string[],
    returnCylinderIds: string[],
    totalCost: number,
    isUnpaid: boolean = false,
    returnRegulatorQty: number = 0,
    returnBulkQty: Record<string, number> = {},
    // Kosong untuk sewa yang dibayar nanti -- uangnya belum berpindah.
    metodeBayar?: MetodeBayar
  ) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const date = new Date().toISOString();
    const newTransactions: Transaction[] = [];

    // Botol tanpa kode yang dikembalikan: stok toko bertambah lagi, deposit
    // dikembalikan sebanyak botol yang benar-benar kembali, dan satu baris RETURN
    // dicatat supaya jumlah yang masih dipegang tetap bisa dihitung dari transaksi.
    const bulkKembali = Object.entries(returnBulkQty).filter(([, qty]) => qty > 0);
    if (bulkKembali.length) {
      let depositDikembalikan = 0;

      for (const [size, qty] of bulkKembali) {
        const tarif = tariffs.find(t => t.kind === 'CYLINDER' && !t.isCoded && t.size === size);
        if (!tarif) continue;

        await supabase.from('rental_tariffs')
          .update({ stockQty: (tarif.stockQty || 0) + qty })
          .eq('id', tarif.id);

        depositDikembalikan += (Number(tarif.depositAmount) || 0) * qty;

        newTransactions.push({
          id: `t-ret-curah-${Date.now()}-${size}`,
          memberId,
          type: 'RETURN',
          date,
          quantity: qty,
          size: size as CylinderSize,
          depositAmount: (Number(tarif.depositAmount) || 0) * qty,
        });
      }

      if (depositDikembalikan > 0) {
        const sisaDeposit = Math.max(0, (member.totalDeposit || 0) - depositDikembalikan);
        await supabase.from('members').update({ totalDeposit: sisaDeposit }).eq('id', memberId);
        setMembers(prev => prev.map(m => (m.id === memberId ? { ...m, totalDeposit: sisaDeposit } : m)));
      }
    }

    // Regulator sewaan yang ikut dikembalikan bersama tabung. Cuma dicatat
    // sebagai baris RETURN -- regulatorUsedStock (kepemilikan) tidak disentuh,
    // yang sedang beredar diturunkan dari transaksi ini.
    if (returnRegulatorQty > 0) {
      const tarifRegulator = tariffs.find(t => t.kind === 'REGULATOR' && t.isActive);
      if (tarifRegulator) {
        newTransactions.push({
          id: `t-ret-reg-${Date.now()}`,
          memberId,
          type: 'RETURN',
          date,
          regulatorTariffId: tarifRegulator.id,
          regulatorQty: returnRegulatorQty,
        });
      }
    }

    // Update Debt
    if (isUnpaid && totalCost > 0) {
      const newDebt = member.totalDebt + totalCost;
      await supabase.from('members').update({ totalDebt: newDebt }).eq('id', memberId);
      setMembers(prev => prev.map(m => m.id === memberId ? { ...m, totalDebt: newDebt } : m));
    }

    // 1. Process Rentals
    if (rentCylinderIds.length > 0) {
      await supabase.from('cylinders').update({
        status: CylinderStatus.Rented,
        currentHolder: memberId,
        lastLocation: member.companyName,
        heldSince: date.slice(0, 10)
      }).in('id', rentCylinderIds);

      rentCylinderIds.forEach(id => {
        newTransactions.push({
          id: `t-rent-${Date.now()}-${id}`,
          cylinderId: id,
          memberId: memberId,
          type: 'RENTAL_OUT',
          date: date,
          cost: rentCylinderIds.length > 0 ? (totalCost / rentCylinderIds.length) : 0,
          paymentStatus: isUnpaid ? 'UNPAID' : 'PAID',
          paymentMethod: isUnpaid ? undefined : metodeBayar
        });
      });
    }

    // 2. Process Returns
    if (returnCylinderIds.length > 0) {
      // heldSince ikut dikosongkan: kolomnya menerangkan pemegang saat ini, dan
      // tabung ini sudah tidak dipegang siapa pun. Riwayatnya tetap ada di
      // transaksi RENTAL_OUT/RETURN.
      await supabase.from('cylinders').update({
        status: CylinderStatus.EmptyRefill,
        currentHolder: null,
        lastLocation: 'Gudang Utama',
        heldSince: null
      }).in('id', returnCylinderIds);

      returnCylinderIds.forEach(id => {
        // Calculate Duration (Logic duplicated from original, in real app better extracted)
        let duration = 0;
        const lastRentTx = transactions
          .filter(t => t.cylinderId === id && t.memberId === memberId && t.type === 'RENTAL_OUT')
          .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

        if (lastRentTx) {
          const diffMs = new Date().getTime() - new Date(lastRentTx.date).getTime();
          duration = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        newTransactions.push({
          id: `t-ret-${Date.now()}-${id}`,
          cylinderId: id,
          memberId: memberId,
          type: 'RETURN',
          date: date,
          rentalDuration: duration
        });
      });
    }

    if (newTransactions.length > 0) {
      await supabase.from('transactions').insert(newTransactions);
      // Refresh local state or optimistic update
      // Simple refresh logic for cylinders to ensure sync:
      const updatedCylinders = cylinders.map(c => {
        if (rentCylinderIds.includes(c.id)) {
          return { ...c, status: CylinderStatus.Rented, currentHolder: memberId, lastLocation: member.companyName, heldSince: date.slice(0, 10) };
        }
        if (returnCylinderIds.includes(c.id)) {
          return { ...c, status: CylinderStatus.EmptyRefill, currentHolder: undefined, lastLocation: 'Gudang Utama', heldSince: null };
        }
        return c;
      });
      setCylinders(updatedCylinders);
      setTransactions([...transactions, ...newTransactions]);
    }
  };

  // Loading Screen
  if (isLoading) {
    return (
      <div className="h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
          <p className="text-gray-500 font-medium">Menghubungkan ke database...</p>
        </div>
      </div>
    );
  }

  // Protection Guard
  if (!currentUser) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <HashRouter>
      <Layout currentUser={currentUser} onLogout={handleLogout}>
        <Routes>
          <Route path="/" element={
            <Dashboard
              cylinders={cylinders}
              transactions={transactions}
              members={members}
              stations={refillStations}
              tariffs={tariffs}
              gasOrders={gasOrders}
            />
          } />
          <Route path="/inventory" element={
            <InventoryView
              cylinders={cylinders}
              transactions={transactions}
              onAdd={handleAddCylinder}
              onBulkAdd={handleBulkAddCylinder}
              onUpdate={handleUpdateCylinder}
              onDelete={handleDeleteCylinder}
            />
          } />
          <Route path="/tukar-isi" element={
            <GasExchangeView
              tariffs={tariffs}
              members={members}
              transactions={transactions}
              onSubmit={handleGasExchange}
            />
          } />
          <Route path="/antrian" element={
            <AntrianIsiView
              orders={gasOrders}
              members={members}
              cylinders={cylinders}
              tariffs={tariffs}
              onBuat={handleBuatPesanan}
              onBayar={handleBayarPesanan}
              onSerahkan={handleSerahkanPesanan}
              onBatalkan={handleBatalkanPesanan}
            />
          } />
          <Route path="/kas" element={
            <KasView
              transactions={transactions}
              role={currentUser.role}
              onSubmit={handleCatatKas}
              onDelete={handleHapusKas}
            />
          } />

          {/* Pengeluaran pindah jadi salah satu tab di /kas. Tautan lamanya ditahan
              supaya penanda buku yang sudah dibuat orang tidak jatuh ke Beranda. */}
          <Route path="/pengeluaran" element={<Navigate to="/kas?jenis=keluar" replace />} />
          <Route path="/bon" element={
            <BonView
              members={members}
              transactions={transactions}
              role={currentUser.role}
              onBayar={(p: BayarBonPayload) =>
                handlePayDebt(p.memberId, p.jumlah, p.billIds, { date: p.tanggal, description: p.catatan })}
              onTambah={(p: TambahBonPayload) =>
                handleTambahBon(p.memberId, p.jumlah, p.tanggal)}
              onHapusBon={handleHapusBon}
              onHapusBaris={handleHapusBarisBon}
            />
          } />
          <Route path="/rental" element={
            <RentalForm
              cylinders={cylinders}
              members={members}
              prices={memberPrices}
              gasPrices={gasPrices}
              transactions={transactions}
              tariffs={tariffs}
              onCompleteRental={handleRental}
              onNewRental={handleNewRental}
            />
          } />
          <Route path="/delivery" element={
            <DeliveryView
              cylinders={cylinders}
              onDeliver={handleDeliverCylinders}
            />
          } />
          <Route path="/refill" element={
            <RefillView
              cylinders={cylinders}
              stations={refillStations}
              refillPrices={refillPrices}
              transactions={transactions}
              onUpdateRefillPrices={handleUpdateRefillPrices}
              drafts={refillDrafts}
              onSaveDraft={handleSaveRefillDraft}
              onDeleteDraft={handleDeleteRefillDraft}
              currentUserName={currentUser?.name}
              onSendToRefill={handleSendToRefill}
              onReceiveFromRefill={handleReceiveFromRefill}
              onAddStation={handleAddStation}
              onUpdateStation={handleUpdateStation}
              onDeleteStation={handleDeleteStation}
            />
          } />
          <Route
            path="/members"
            element={
              <MembersView
                members={members}
                prices={memberPrices}
                onUpdatePrices={async (newPrices) => {
                  // Update prices logic
                  // Deleting old for member and inserting new is simplest strategy for now, or Upsert
                  // For this mock conversion, just updating local state for visual speed, 
                  // but in real app you need specific Supabase calls for Add/Edit/Delete price
                  setMemberPrices(newPrices);
                }}
                transactions={transactions}
                cylinders={cylinders}
                tariffs={tariffs}
                gasOrders={gasOrders}
                onAddMember={handleAddMember}
                onUpdateMember={handleUpdateMember}
                onDeleteMember={handleDeleteMember}
                onPayDebt={handlePayDebt}
                onRequestExit={handleMemberExitRequest}
                onProcessRefund={handleMemberRefund}
              />
            }
          />
          <Route path="/reports" element={
            <ReportsView
              cylinders={cylinders}
              transactions={transactions}
              members={members}
              stations={refillStations}
              role={currentUser.role}
              onBatalkanTransaksi={handleBatalkanTransaksi}
              onCatatPengeluaran={handleCatatPengeluaran}
            />
          } />

          {/* Admin Only Route */}
          {bolehKelolaPengguna(currentUser.role) && (
            <Route path="/admin" element={
              <AdminView
                users={users}
                currentUser={currentUser}
                onAddUser={handleAddUser}
                onUpdateUser={handleUpdateUser}
                onDeleteUser={handleDeleteUser}
              />
            } />
          )}

          {/* Master Data terbuka untuk semua peran -- tarif dan stok bagian dari
              pekerjaan harian Operator, bukan urusan keuangan. */}
          <Route path="/master-data" element={
            <MasterDataView tariffs={tariffs} transactions={transactions} onRefresh={fetchData} />
          } />

          <Route path="/history" element={
            <HistoryView
              transactions={transactions}
              cylinders={cylinders}
              members={members}
              stations={refillStations}
            />
          } />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>

        <ChatBot
          cylinders={cylinders}
          members={members}
          transactions={transactions}
          memberPrices={memberPrices}
          refillStations={refillStations}
        />
      </Layout>
    </HashRouter>
  );
};

export default App;
