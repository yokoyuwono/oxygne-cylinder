
import React, { useState, useMemo } from 'react';
import { Cylinder, Transaction, Member, RefillStation, GasType, CylinderStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend, AreaChart, Area } from 'recharts';

interface ReportsViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
}

const COLORS = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const ReportsView: React.FC<ReportsViewProps> = ({ cylinders, transactions, members, stations }) => {
  const [activeTab, setActiveTab] = useState<'inventory' | 'financials' | 'logs'>('inventory');
  const [logFilter, setLogFilter] = useState('');

  // -- Helpers --
  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);
  
  // -- Data Processing: Inventory --
  const totalCylinders = cylinders.length;
  const rentedCount = cylinders.filter(c => c.status === CylinderStatus.Rented).length;
  const availableCount = cylinders.filter(c => c.status === CylinderStatus.Available).length;
  const refillCount = cylinders.filter(c => [CylinderStatus.Refilling, CylinderStatus.EmptyRefill].includes(c.status)).length;
  const utilizationRate = totalCylinders ? Math.round((rentedCount / totalCylinders) * 100) : 0;

  const gasDistributionData = Object.values(GasType).map(gas => ({
      name: gas.split(' ')[0], // Short name
      count: cylinders.filter(c => c.gasType === gas).length
  }));

  const statusDistributionData = [
      { name: 'Available', value: availableCount, color: '#22c55e' },
      { name: 'Rented', value: rentedCount, color: '#6366f1' },
      { name: 'Refill/Empty', value: refillCount, color: '#f59e0b' },
      { name: 'Damaged', value: cylinders.filter(c => c.status === CylinderStatus.Damaged).length, color: '#ef4444' },
  ].filter(d => d.value > 0);

  // -- Data Processing: Financials (Refill Costs) --
  const refillTransactions = transactions.filter(t => t.type === 'REFILL_IN' && (t.cost || 0) > 0);
  const totalRefillCost = refillTransactions.reduce((sum, t) => sum + (t.cost || 0), 0);
  const avgRefillCost = refillTransactions.length ? Math.round(totalRefillCost / refillTransactions.length) : 0;

  const costByStationData = stations.map(s => {
      // Find all REFILL_OUT txs to this station, then find the corresponding REFILL_IN? 
      // Simplified: We look for REFILL_IN transactions. 
      // Note: In our current model, REFILL_IN doesn't explicitly store stationId, 
      // but REFILL_OUT does. For accurate reporting, we'd link them. 
      // For this mock, we'll estimate based on 'RefillStation' usage or REFILL_OUT count.
      // *Correction*: Let's track 'REFILL_OUT' to see volume sent to station.
      const sentCount = transactions.filter(t => t.type === 'REFILL_OUT' && t.refillStationId === s.id).length;
      return {
          name: s.name,
          value: sentCount
      };
  }).filter(d => d.value > 0);

  // -- Data Processing: Logs --
  const filteredLogs = useMemo(() => {
      return transactions.filter(t => {
          const cyl = cylinders.find(c => c.id === t.cylinderId);
          const member = members.find(m => m.id === t.memberId);
          const station = stations.find(s => s.id === t.refillStationId);
          
          const searchStr = `${t.id} ${t.type} ${cyl?.serialCode} ${member?.companyName} ${station?.name}`.toLowerCase();
          return searchStr.includes(logFilter.toLowerCase());
      }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, cylinders, members, stations, logFilter]);

  const getTxDescription = (t: Transaction) => {
      const cyl = cylinders.find(c => c.id === t.cylinderId);
      const member = members.find(m => m.id === t.memberId);
      const station = stations.find(s => s.id === t.refillStationId);
      const code = cyl?.serialCode || 'Unknown';

      switch(t.type) {
          case 'RENTAL_OUT': return { title: `Rented ${code}`, subtitle: `To ${member?.companyName}`, icon: 'shopping_cart', color: 'bg-blue-100 text-blue-600' };
          case 'RETURN': return { title: `Returned ${code}`, subtitle: `From ${member?.companyName}`, icon: 'assignment_return', color: 'bg-green-100 text-green-600' };
          case 'REFILL_OUT': return { title: `Sent to Refill ${code}`, subtitle: `To ${station?.name}`, icon: 'local_shipping', color: 'bg-orange-100 text-orange-600' };
          case 'REFILL_IN': return { title: `Restocked ${code}`, subtitle: `Cost: ${t.cost ? formatIDR(t.cost) : '-'}`, icon: 'inventory_2', color: 'bg-indigo-100 text-indigo-600' };
          default: return { title: 'Unknown', subtitle: '', icon: 'help', color: 'bg-gray-100' };
      }
  };

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

      {/* TAB: FINANCIALS */}
      {activeTab === 'financials' && (
          <div className="space-y-6 animate-fade-in">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-indigo-600 p-6 rounded-xl shadow-lg text-white">
                      <div className="flex items-start justify-between">
                          <div>
                              <p className="text-indigo-200 text-sm font-medium mb-1">Total Refill Expenses</p>
                              <h3 className="text-3xl font-bold">{formatIDR(totalRefillCost)}</h3>
                          </div>
                          <div className="p-3 bg-indigo-500 rounded-lg">
                              <span className="material-icons text-white">paid</span>
                          </div>
                      </div>
                      <p className="text-indigo-200 text-xs mt-4">Lifetime tracked expenses</p>
                  </div>

                  <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                      <div className="flex items-start justify-between">
                          <div>
                              <p className="text-gray-500 text-sm font-medium mb-1">Avg Cost / Batch</p>
                              <h3 className="text-3xl font-bold text-gray-800">{formatIDR(avgRefillCost)}</h3>
                          </div>
                          <div className="p-3 bg-gray-50 rounded-lg text-gray-400">
                              <span className="material-icons">analytics</span>
                          </div>
                      </div>
                      <p className="text-gray-400 text-xs mt-4">Based on {refillTransactions.length} recorded restock batches</p>
                  </div>
              </div>

              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <h3 className="font-bold text-gray-800 mb-4">Refill Volume by Station</h3>
                  <div className="h-64 flex flex-col items-center justify-center">
                        {costByStationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={costByStationData}
                                        cx="50%"
                                        cy="50%"
                                        outerRadius={80}
                                        dataKey="value"
                                        label={({name, percent}) => `${name} ${(percent * 100).toFixed(0)}%`}
                                    >
                                        {costByStationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'}} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-400 text-sm">No station data available yet.</p>
                        )}
                  </div>
              </div>

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                  <div className="p-4 bg-gray-50 border-b border-gray-100">
                      <h3 className="font-bold text-gray-800">Recent Refill Expenses</h3>
                  </div>
                  <div className="divide-y divide-gray-100">
                      {refillTransactions.length > 0 ? (
                          refillTransactions.slice(0, 5).map(t => {
                              const cyl = cylinders.find(c => c.id === t.cylinderId);
                              return (
                                  <div key={t.id} className="p-4 flex justify-between items-center">
                                      <div className="flex items-center gap-3">
                                          <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                                              <span className="material-icons text-sm">receipt</span>
                                          </div>
                                          <div>
                                              <p className="text-sm font-bold text-gray-800">Restock {cyl?.gasType}</p>
                                              <p className="text-xs text-gray-500">{new Date(t.date).toLocaleDateString()}</p>
                                          </div>
                                      </div>
                                      <span className="font-bold text-red-600">-{formatIDR(t.cost || 0)}</span>
                                  </div>
                              )
                          })
                      ) : (
                          <div className="p-8 text-center text-gray-400 text-sm">No expenses recorded yet.</div>
                      )}
                  </div>
              </div>
          </div>
      )}

      {/* TAB: AUDIT LOG */}
      {activeTab === 'logs' && (
          <div className="space-y-4 animate-fade-in">
              <div className="sticky top-0 z-10 bg-gray-50/95 backdrop-blur rounded-xl border border-gray-200 p-3 shadow-sm">
                  <div className="relative">
                        <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                        <input 
                            type="text" 
                            value={logFilter}
                            onChange={(e) => setLogFilter(e.target.value)}
                            className="w-full bg-white border border-gray-300 rounded-lg pl-9 pr-4 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            placeholder="Search log by ID, member, code..."
                        />
                  </div>
              </div>

              <div className="space-y-3">
                  {filteredLogs.length > 0 ? (
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
                                    </div>
                                </div>
                            </div>
                          );
                      })
                  ) : (
                      <div className="p-12 text-center text-gray-400">
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
