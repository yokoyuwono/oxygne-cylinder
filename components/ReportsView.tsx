import React, { useState, useMemo, useEffect } from 'react';
import { Cylinder, Transaction, Member, RefillStation, GasType, CylinderStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { supabase } from '../lib/supabase';

interface ReportsViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
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
                    <h3 className="font-bold text-gray-800">Delivery Manifest</h3>
                    <p className="text-xs text-cyan-700 font-medium">{new Date(date).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
                </div>
            </div>
            <div className="flex items-center gap-3">
                <span className="bg-white text-cyan-700 px-3 py-1 rounded-full text-sm font-bold shadow-sm border border-cyan-100">
                    {txs.length} Items
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
                                    <p className="font-bold text-sm text-gray-800 font-mono">{cyl?.serialCode || 'Unknown'}</p>
                                    <div className="flex items-center gap-2 text-xs text-gray-500">
                                        <span>{cyl?.size}</span>
                                        {cyl?.status === CylinderStatus.Delivery ? (
                                            <span className="text-cyan-600 font-medium flex items-center gap-1">
                                                <span className="w-1.5 h-1.5 rounded-full bg-cyan-500"></span> In Transit
                                            </span>
                                        ) : (
                                            <span className="text-gray-400">Delivered</span>
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

const ReportsView: React.FC<ReportsViewProps> = ({ cylinders, transactions, members, stations }) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'financials' | 'logs' | 'delivery'>('financials');
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
      { name: 'Available', value: availableCount, color: '#22c55e' },
      { name: 'Rented', value: rentedCount, color: '#6366f1' },
      { name: 'Refill/Empty', value: refillCount, color: '#f59e0b' },
      { name: 'Delivery', value: deliveryCount, color: '#06b6d4' },
      { name: 'Damaged', value: cylinders.filter(c => c.status === CylinderStatus.Damaged).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // -- Data Processing: Financials --
  const incomeTransactions = transactions.filter(t => t.type === 'RENTAL_OUT' && (t.cost || 0) > 0);
  const expenseTransactions = transactions.filter(t => t.type === 'REFILL_IN' && (t.cost || 0) > 0);

  const totalIncome = incomeTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const totalExpenses = expenseTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const netProfit = totalIncome - totalExpenses;

  // Monthly Trend Data
  const financialTrendData = useMemo(() => {
    const monthlyData: Record<string, { name: string, Income: number, Expense: number, timestamp: number }> = {};
    
    [...incomeTransactions, ...expenseTransactions].forEach(t => {
        const date = new Date(t.date);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const name = date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        
        if (!monthlyData[key]) {
            monthlyData[key] = { name, Income: 0, Expense: 0, timestamp: date.getTime() };
        }
        
        if (t.type === 'RENTAL_OUT') {
            monthlyData[key].Income += (t.cost || 0);
        } else if (t.type === 'REFILL_IN') {
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
              name: members.find(m => m.id === id)?.companyName || 'Unknown',
              value: val
          }))
          .sort((a, b) => b.value - a.value)
          .slice(0, 5); // Top 5
  }, [incomeTransactions, members]);

  // Combined Financial Activity Feed
  const recentFinancialActivity = [...incomeTransactions, ...expenseTransactions]
      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
      .slice(0, 10);

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

  const getTxDescription = (t: Transaction) => {
      const cyl = cylinders.find(c => c.id === t.cylinderId);
      const member = members.find(m => m.id === t.memberId);
      const station = stations.find(s => s.id === t.refillStationId);
      const code = cyl?.serialCode || 'Unknown';

      switch(t.type) {
          case 'RENTAL_OUT': return { title: `Rented ${code}`, subtitle: `To ${member?.companyName}`, icon: 'shopping_cart', color: 'bg-blue-100 text-blue-600', badge: 'RENTAL' };
          case 'RETURN': return { title: `Returned ${code}`, subtitle: `From ${member?.companyName}`, icon: 'assignment_return', color: 'bg-green-100 text-green-600', badge: 'RETURN' };
          case 'REFILL_OUT': return { title: `Sent to Refill ${code}`, subtitle: `To ${station?.name}`, icon: 'local_shipping', color: 'bg-orange-100 text-orange-600', badge: 'DISPATCH' };
          case 'REFILL_IN': return { title: `Restocked ${code}`, subtitle: `Cost: ${t.cost ? formatIDR(t.cost) : '-'}`, icon: 'inventory_2', color: 'bg-indigo-100 text-indigo-600', badge: 'RESTOCK' };
          case 'DEBT_PAYMENT': return { title: 'Debt Payment', subtitle: `From ${member?.companyName}`, icon: 'payments', color: 'bg-teal-100 text-teal-600', badge: 'PAYMENT' };
          case 'DEPOSIT_REFUND': return { title: 'Deposit Refund', subtitle: `To ${member?.companyName}`, icon: 'savings', color: 'bg-purple-100 text-purple-600', badge: 'REFUND' };
          case 'DELIVERY': return { title: `Delivery ${code}`, subtitle: 'In Transit', icon: 'local_shipping', color: 'bg-cyan-100 text-cyan-600', badge: 'DELIVERY' };
          default: return { title: 'Unknown', subtitle: '', icon: 'help', color: 'bg-gray-100', badge: 'OTHER' };
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
              {isDeliveryLoading ? 'Loading...' : `Page ${deliveryPage} of ${totalDeliveryPages || 1}`}
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
           <h2 className="text-2xl font-bold text-gray-800">Reports & Analytics</h2>
           <p className="text-gray-500 text-sm">System performance, financial tracking, and audit logs.</p>
        </div>
        
        {/* Tab Navigation */}
        <div className="flex bg-white rounded-lg p-1 border border-gray-200 w-full md:w-auto overflow-x-auto hide-scrollbar">
            {[
                { id: 'inventory', label: 'Stock & Usage', icon: 'pie_chart' },
                { id: 'delivery', label: 'Delivery Report', icon: 'local_shipping' },
                { id: 'financials', label: 'Financials', icon: 'paid' },
                { id: 'logs', label: 'Audit Log', icon: 'receipt_long' }
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
                    <p className="text-xs text-gray-500 uppercase font-bold">Total Assets</p>
                    <p className="text-2xl font-bold text-gray-800">{totalCylinders}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Utilization</p>
                    <p className={`text-2xl font-bold ${utilizationRate > 80 ? 'text-green-600' : 'text-blue-600'}`}>{utilizationRate}%</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Rented Out</p>
                    <p className="text-2xl font-bold text-indigo-600">{rentedCount}</p>
                </div>
                <div className="bg-white p-4 rounded-xl border border-gray-100 shadow-sm">
                    <p className="text-xs text-gray-500 uppercase font-bold">Needs Refill</p>
                    <p className="text-2xl font-bold text-orange-500">{refillCount}</p>
                </div>
             </div>

             <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                 {/* Gas Type Distribution */}
                 <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                     <h3 className="font-bold text-gray-800 mb-6">Inventory by Gas Type</h3>
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
                     <h3 className="font-bold text-gray-800 mb-2">Current Status Breakdown</h3>
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
                    <p>Loading delivery reports...</p>
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
                    <p>No delivery history found.</p>
                </div>
            )}

            {/* Bottom Pagination */}
            {deliveryGroups.length > 0 && <PaginationControls />}
        </div>
      )}

      {/* TAB: FINANCIALS */}
      {activeTab === 'financials' && (
          <div className="space-y-6 animate-fade-in">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-green-50 rounded-xl text-green-600">
                          <span className="material-icons text-3xl">payments</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Total Income</p>
                          <h3 className="text-2xl font-bold text-gray-800">{formatIDR(totalIncome)}</h3>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className="p-3 bg-red-50 rounded-xl text-red-600">
                          <span className="material-icons text-3xl">trending_down</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Total Expenses</p>
                          <h3 className="text-2xl font-bold text-gray-800">{formatIDR(totalExpenses)}</h3>
                      </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm flex items-center gap-4">
                      <div className={`p-3 rounded-xl ${netProfit >= 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-orange-50 text-orange-600'}`}>
                          <span className="material-icons text-3xl">account_balance_wallet</span>
                      </div>
                      <div>
                          <p className="text-gray-500 text-sm font-medium uppercase">Net Profit</p>
                          <h3 className={`text-2xl font-bold ${netProfit >= 0 ? 'text-indigo-700' : 'text-orange-600'}`}>{formatIDR(netProfit)}</h3>
                      </div>
                  </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Financial Trends */}
                  <div className="lg:col-span-2 bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-6">Financial Performance (Monthly)</h3>
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
                                  <Bar dataKey="Income" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={20} />
                                  <Bar dataKey="Expense" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={20} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </div>

                  {/* Top Customers by Revenue */}
                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <h3 className="font-bold text-gray-800 mb-4">Top Revenue Sources</h3>
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
                              No revenue data available.
                          </div>
                      )}
                  </div>
              </div>

              {/* Recent Activity List */}
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-100 flex justify-between items-center">
                      <h3 className="font-bold text-gray-800">Recent Financial Transactions</h3>
                      <button onClick={() => setActiveTab('logs')} className="text-sm text-indigo-600 font-medium hover:underline">View All</button>
                  </div>
                  <div className="divide-y divide-gray-100">
                      {recentFinancialActivity.length > 0 ? (
                          recentFinancialActivity.map(t => {
                              const isIncome = t.type === 'RENTAL_OUT';
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
                                                  {isIncome ? `Rental Revenue - ${member?.companyName || 'Unknown'}` : `Refill Expense - ${cyl?.gasType}`}
                                              </p>
                                              <p className="text-xs text-gray-500">
                                                  {new Date(t.date).toLocaleDateString()} • {cyl?.serialCode ? `Item: ${cyl.serialCode}` : 'Batch Operation'}
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
                          <div className="p-8 text-center text-gray-400 text-sm">No recent transactions.</div>
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
                            placeholder="Search log by ID, member, code..."
                        />
                  </div>
                  
                  <select
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white min-w-[140px]"
                  >
                      <option value="ALL">All Types</option>
                      <option value="RENTAL_OUT">Rental Out</option>
                      <option value="RETURN">Return</option>
                      <option value="REFILL_OUT">Refill Out</option>
                      <option value="REFILL_IN">Refill In</option>
                      <option value="DEBT_PAYMENT">Debt Payment</option>
                      <option value="DEPOSIT_REFUND">Deposit Refund</option>
                      <option value="DELIVERY">Delivery</option>
                  </select>

                  <div className="flex bg-gray-100 p-1 rounded-lg border border-gray-200">
                    <button 
                        onClick={() => setViewMode('table')}
                        className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'table' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Table View"
                    >
                        <span className="material-icons text-xl">table_chart</span>
                    </button>
                    <button 
                        onClick={() => setViewMode('card')}
                        className={`p-1.5 rounded-md flex items-center justify-center transition-all ${viewMode === 'card' ? 'bg-white shadow-sm text-indigo-600' : 'text-gray-500 hover:bg-gray-200'}`}
                        title="Card View"
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
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-40">Date</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700 w-32">Type</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Item Details</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700">Related Party</th>
                                            <th className="px-6 py-3 font-semibold text-gray-700 text-right">Amount</th>
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
                                                        <div className="font-medium text-gray-800">{new Date(t.date).toLocaleDateString()}</div>
                                                        <div className="text-xs">{new Date(t.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</div>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        <span className={`px-2 py-1 rounded text-xs font-bold uppercase ${getTypeBadgeClass(t.type)}`}>
                                                            {t.type.replace('_', ' ')}
                                                        </span>
                                                    </td>
                                                    <td className="px-6 py-4">
                                                        {cyl ? (
                                                            <div>
                                                                <div className="font-mono font-medium text-gray-800">{cyl.serialCode}</div>
                                                                <div className="text-xs text-gray-500">{cyl.gasType} • {cyl.size}</div>
                                                            </div>
                                                        ) : (
                                                            <span className="text-gray-400 italic">N/A</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-4 text-gray-700">
                                                        {member ? member.companyName : (station ? station.name : '-')}
                                                    </td>
                                                    <td className="px-6 py-4 text-right font-medium">
                                                        {t.cost ? formatIDR(t.cost) : '-'}
                                                    </td>
                                                    <td className="px-6 py-4 text-right">
                                                        {t.paymentStatus ? (
                                                            <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${t.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                                                {t.paymentStatus}
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
                          const info = getTxDescription(t);
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
                                            {new Date(t.date).toLocaleDateString()}
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
                                                {t.paymentStatus}
                                            </span>
                                        )}
                                    </div>
                                </div>
                                {t.cost && (
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
                          <p>No transactions found matching filter.</p>
                      </div>
                  )}
              </div>
          </div>
      )}
    </div>
  );
};

export default ReportsView;