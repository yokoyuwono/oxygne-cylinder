
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './components/Dashboard';
import CylinderList from './components/CylinderList';
import MembersView from './components/MembersView';
import ChatBot from './components/ChatBot';
import RentalForm from './components/RentalForm';
import RefillView from './components/RefillView';
import DeliveryView from './components/DeliveryView';
import ReportsView from './components/ReportsView';
import Login from './components/Login';
import AdminView from './components/AdminView';
import HistoryView from './components/HistoryView';
import { Cylinder, Member, Transaction, MemberPrice, CylinderStatus, RefillStation, RefillPrice, AppUser, UserRole, MemberStatus, GasPrice } from './types';
import { supabase, isSupabaseConfigured, fetchAllRecords } from './lib/supabase';

const App: React.FC = () => {
  // -- Configuration Guard --
  if (!isSupabaseConfigured) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans">
        <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-lg border border-gray-100 text-center animate-fade-in-up">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <span className="material-icons text-3xl">settings_alert</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-800 mb-2">Configuration Required</h1>
          <p className="text-gray-500 mb-6">
            The application cannot connect to Supabase. Please set up your environment variables to continue.
          </p>

          <div className="bg-slate-900 rounded-lg p-4 text-left overflow-x-auto mb-6">
            <p className="text-slate-400 text-xs uppercase font-bold mb-2">.env / Environment Variables</p>
            <code className="text-green-400 text-sm font-mono block mb-1">VITE_SUPABASE_URL=your_project_url</code>
            <code className="text-green-400 text-sm font-mono block">VITE_SUPABASE_ANON_KEY=your_anon_key</code>
          </div>

          <p className="text-sm text-gray-400">
            If you are running this locally, create a <span className="font-mono bg-gray-100 px-1 rounded">.env</span> file in the project root.
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
        rpData
      ] = await Promise.all([
        fetchAllRecords<Cylinder>('cylinders'),
        fetchAllRecords<Member>('members'),
        fetchAllRecords<Transaction>('transactions'),
        fetchAllRecords<MemberPrice>('member_prices'),
        fetchAllRecords<GasPrice>('refill_prices'),
        fetchAllRecords<RefillStation>('refill_stations'),
        fetchAllRecords<RefillPrice>('refill_prices')
      ]);

      if (cylData) setCylinders(cylData);
      if (memData) setMembers(memData);
      if (txData) setTransactions(txData);
      if (mpData) setMemberPrices(mpData);
      if (gpData) setGasPrices(gpData);
      if (rsData) setRefillStations(rsData);
      if (rpData) setRefillPrices(rpData);

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
            username: profile.username || session.user.email || '',
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
  const handleLogin = async (username: string, pass: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: username,
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
          username: profile.username || username,
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
  const handleAddUser = async (user: AppUser) => {
    // In real app: Call Cloud Function to create Supabase Auth User
    alert("Please use Supabase Dashboard to create new Auth Users.");
  };
  const handleUpdateUser = async (user: AppUser) => {
    const { error } = await supabase.from('profiles').update({ role: user.role, name: user.name }).eq('id', user.id);
    if (!error) {
      setUsers(prev => prev.map(u => u.id === user.id ? user : u));
    }
  };
  const handleDeleteUser = (id: string) => {
    // Admin deletion logic
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

  // Handler for rental transactions (Rentals AND Returns)
  const handleRental = async (
    memberId: string,
    rentCylinderIds: string[],
    returnCylinderIds: string[],
    totalCost: number,
    isUnpaid: boolean = false
  ) => {
    const member = members.find(m => m.id === memberId);
    if (!member) return;

    const date = new Date().toISOString();
    const newTransactions: Transaction[] = [];

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
          <p className="text-gray-500 font-medium">Connecting to Database...</p>
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
            />
          } />
          <Route path="/inventory" element={
            <CylinderList
              cylinders={cylinders}
              transactions={transactions}
              onAdd={handleAddCylinder}
              onBulkAdd={handleBulkAddCylinder}
              onUpdate={handleUpdateCylinder}
              onDelete={handleDeleteCylinder}
            />
          } />
          <Route path="/rental" element={
            <RentalForm
              cylinders={cylinders}
              members={members}
              prices={memberPrices}
              gasPrices={gasPrices}
              transactions={transactions}
              onCompleteRental={handleRental}
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
            />
          } />

          {/* Admin Only Route */}
          {currentUser.role === UserRole.Admin && (
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
