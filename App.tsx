
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
import { NewRentalPayload } from './components/NewRentalForm';
import { Cylinder, Member, Transaction, MemberPrice, CylinderStatus, CylinderSize, RefillStation, RefillPrice, AppUser, UserRole, MemberStatus, GasPrice, RentalTariff } from './types';
import { bolehKelolaPengguna } from './lib/peran';
import PengeluaranView, { PengeluaranPayload } from './components/PengeluaranView';
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
  const [users, setUsers] = useState<AppUser[]>([]); // For Admin View
  const [tariffs, setTariffs] = useState<RentalTariff[]>([]);

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
        rtData
      ] = await Promise.all([
        fetchAllRecords<Cylinder>('cylinders'),
        fetchAllRecords<Member>('members'),
        fetchAllRecords<Transaction>('transactions'),
        fetchAllRecords<MemberPrice>('member_prices'),
        fetchAllRecords<GasPrice>('refill_prices'),
        fetchAllRecords<RefillStation>('refill_stations'),
        fetchAllRecords<RefillPrice>('refill_prices'),
        fetchAllRecords<BarisProfil>('profiles'),
        fetchAllRecords<RentalTariff>('rental_tariffs')
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

  const handlePayDebt = async (memberId: string, amount: number, billIds: string[]) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const newDebt = Math.max(0, member.totalDebt - amount);

    // 1. Update Member
    await supabase.from('members').update({ totalDebt: newDebt }).eq('id', memberId);
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
      date: new Date().toISOString(),
      cost: amount,
      paymentStatus: 'PAID',
      relatedTransactionIds: billIds
    };
    await supabase.from('transactions').insert(newTx);
    setTransactions(prev => [...prev, newTx]);
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
  };

  const handleUpdateRefillPrices = async (newPrices: RefillPrice[]) => {
    // Simplistic approach: Upsert all
    await supabase.from('refill_prices').upsert(newPrices);
    setRefillPrices(newPrices);
    // Better to refetch all to ensure full consistency and bypass pagination limits
    const data = await fetchAllRecords<RefillPrice>('refill_prices');
    if (data) setRefillPrices(data);
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
      lastLocation: station.name
    }).in('id', cylinderIds);

    // Add Transactions
    await supabase.from('transactions').insert(newTransactions);

    setCylinders(prev => prev.map(c => {
      if (cylinderIds.includes(c.id)) {
        return {
          ...c,
          status: CylinderStatus.Refilling,
          currentHolder: 'RefillStation',
          lastLocation: station.name
        };
      }
      return c;
    }));
    setTransactions(prev => [...prev, ...newTransactions]);
  };

  const handleReceiveFromRefill = async (cylinderIds: string[], totalCost: number) => {
    const date = new Date().toISOString();
    const costPerUnit = totalCost / cylinderIds.length;

    const newTransactions: Transaction[] = cylinderIds.map(id => ({
      id: `t-ref-in-${Date.now()}-${id}`,
      cylinderId: id,
      type: 'REFILL_IN',
      date: date,
      cost: costPerUnit
    }));

    await supabase.from('cylinders').update({
      status: CylinderStatus.Available,
      currentHolder: null,
      lastLocation: 'Gudang Utama'
    }).in('id', cylinderIds);

    await supabase.from('transactions').insert(newTransactions);

    setCylinders(prev => prev.map(c => {
      if (cylinderIds.includes(c.id)) {
        return {
          ...c,
          status: CylinderStatus.Available,
          currentHolder: undefined,
          lastLocation: 'Gudang Utama'
        };
      }
      return c;
    }));

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
    const { isNewMember, member, rentalDate, items, totals } = payload;

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
    const cylinderIds = items.map(i => i.cylinderId).filter(Boolean) as string[];
    if (cylinderIds.length) {
      const { error: errCyl } = await supabase.from('cylinders').update({
        status: CylinderStatus.Rented,
        currentHolder: member.name,
        lastLocation: member.name,
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
      quantity: payload.quantity,
      size: payload.size,
      gasPrice: payload.pricePerUnit,
    };

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw new Error(`Gagal mencatat tukar isi: ${error.message}`);

    setTransactions(prev => [...prev, tx]);
  };

  /**
   * Belanja operasional harian. Tidak menyentuh tabung, pelanggan, atau stok --
   * hanya uang keluar dengan keterangan, jadi cukup satu baris transaksi.
   */
  const handleTambahPengeluaran = async (payload: PengeluaranPayload) => {
    const tx: Transaction = {
      id: `t-biaya-${Date.now()}`,
      type: 'EXPENSE',
      date: payload.date,
      cost: payload.amount,
      paymentStatus: 'PAID',
      description: payload.description,
    };

    const { error } = await supabase.from('transactions').insert(tx);
    if (error) throw new Error(`Gagal mencatat pengeluaran: ${error.message}`);

    setTransactions(prev => [...prev, tx]);
  };

  const handleHapusPengeluaran = async (id: string) => {
    const { error } = await supabase.from('transactions').delete().eq('id', id);
    if (error) throw new Error(`Gagal menghapus pengeluaran: ${error.message}`);

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
    returnBulkQty: Record<string, number> = {}
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
        lastLocation: member.companyName
      }).in('id', rentCylinderIds);

      rentCylinderIds.forEach(id => {
        newTransactions.push({
          id: `t-rent-${Date.now()}-${id}`,
          cylinderId: id,
          memberId: memberId,
          type: 'RENTAL_OUT',
          date: date,
          cost: rentCylinderIds.length > 0 ? (totalCost / rentCylinderIds.length) : 0,
          paymentStatus: isUnpaid ? 'UNPAID' : 'PAID'
        });
      });
    }

    // 2. Process Returns
    if (returnCylinderIds.length > 0) {
      await supabase.from('cylinders').update({
        status: CylinderStatus.EmptyRefill,
        currentHolder: null,
        lastLocation: 'Gudang Utama'
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
          return { ...c, status: CylinderStatus.Rented, currentHolder: memberId, lastLocation: member.companyName };
        }
        if (returnCylinderIds.includes(c.id)) {
          return { ...c, status: CylinderStatus.EmptyRefill, currentHolder: undefined, lastLocation: 'Gudang Utama' };
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
          <Route path="/pengeluaran" element={
            <PengeluaranView
              transactions={transactions}
              role={currentUser.role}
              onSubmit={handleTambahPengeluaran}
              onDelete={handleHapusPengeluaran}
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
              onUpdateRefillPrices={handleUpdateRefillPrices}
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
