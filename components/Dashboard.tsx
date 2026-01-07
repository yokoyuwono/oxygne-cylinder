import React, { useState, useMemo } from 'react';
import { Cylinder, CylinderStatus, GasType, Transaction, Member, RefillStation, MemberStatus } from '../types';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts';
import { useNavigate } from 'react-router-dom';

interface DashboardProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  members: Member[];
  stations: RefillStation[];
}

const COLORS = ['#22c55e', '#3b82f6', '#f97316', '#eab308', '#ef4444', '#8b5cf6'];

const Dashboard: React.FC<DashboardProps> = ({ cylinders, transactions, members, stations }) => {
  const navigate = useNavigate();
  const [overdueFilter, setOverdueFilter] = useState<'3m' | '6m' | '12m'>('3m');

  // -- Metrics Calculation --
  const totalCylinders = cylinders.length;
  const rentedCylinders = cylinders.filter(c => c.status === CylinderStatus.Rented).length;
  const availableCylinders = cylinders.filter(c => c.status === CylinderStatus.Available).length;
  const needRefill = cylinders.filter(c => c.status === CylinderStatus.EmptyRefill).length;
  const refilling = cylinders.filter(c => c.status === CylinderStatus.Refilling).length;
  const delivery = cylinders.filter(c => c.status === CylinderStatus.Delivery).length;
  const utilizationRate = totalCylinders > 0 ? Math.round((rentedCylinders / totalCylinders) * 100) : 0;

  // -- Overdue / Long Term Logic --
  const overdueData = useMemo(() => {
      const rented = cylinders.filter(c => c.status === CylinderStatus.Rented);
      return rented.map(c => {
          // Find the latest rental transaction for this cylinder
          const lastRentTx = transactions
            .filter(t => t.cylinderId === c.id && t.type === 'RENTAL_OUT')
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
          
          if (!lastRentTx) return null;

          const diffMs = new Date().getTime() - new Date(lastRentTx.date).getTime();
          const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
          const member = members.find(m => m.id === c.currentHolder);

          return {
              id: c.id,
              serialCode: c.serialCode,
              gasType: c.gasType,
              size: c.size,
              member: member,
              rentDate: lastRentTx.date,
              days: days
          };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
      .sort((a, b) => b.days - a.days); // Sort by longest duration first
  }, [cylinders, transactions, members]);

  const filteredOverdue = overdueData.filter(item => {
      if (overdueFilter === '12m') return item.days > 365;
      if (overdueFilter === '6m') return item.days > 180;
      return item.days > 90; // '3m' default
  });

  const longTermRentalsCount = overdueData.filter(i => i.days > 60).length; // Metric for card (> 2 months)

  // -- Refund Alerts --
  const membersReadyForRefund = members.filter(m => {
      if (m.status !== MemberStatus.Pending_Exit || !m.exitRequestDate) return false;
      const requestDate = new Date(m.exitRequestDate);
      const targetDate = new Date(requestDate);
      targetDate.setDate(requestDate.getDate() + 14); // 2 weeks wait
      const now = new Date();
      return now >= targetDate;
  });

  // -- Chart Data --
  const barData = Object.values(GasType).map(gas => {
    return {
      name: gas.split(' ')[0],
      Total: cylinders.filter(c => c.gasType === gas).length,
      Available: cylinders.filter(c => c.gasType === gas && c.status === CylinderStatus.Available).length
    };
  });

  const pieData = [
    { name: 'Available', value: availableCylinders },
    { name: 'Rented', value: rentedCylinders },
    { name: 'Empty', value: needRefill },
    { name: 'Refilling', value: refilling },
    { name: 'Delivery', value: delivery },
    { name: 'Damaged', value: cylinders.filter(c => c.status === CylinderStatus.Damaged).length },
  ].filter(d => d.value > 0);

  // -- Recent Activity Logic --
  const recentTransactions = [...transactions]
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5)
    .map(tx => {
      const cyl = cylinders.find(c => c.id === tx.cylinderId);
      const member = members.find(m => m.id === tx.memberId);
      const station = stations.find(s => s.id === tx.refillStationId);
      
      let description = '';
      let icon = '';
      let colorClass = '';

      switch(tx.type) {
        case 'RENTAL_OUT':
          description = `Rented ${cyl?.gasType} (${cyl?.serialCode}) to ${member?.companyName}`;
          icon = 'shopping_cart_checkout';
          colorClass = 'text-blue-600 bg-blue-50';
          break;
        case 'RETURN':
          description = `Received ${cyl?.serialCode} from ${member?.companyName}`;
          icon = 'assignment_return';
          colorClass = 'text-green-600 bg-green-50';
          break;
        case 'REFILL_OUT':
          description = `Sent ${cyl?.serialCode} to ${station?.name}`;
          icon = 'local_shipping';
          colorClass = 'text-orange-600 bg-orange-50';
          break;
        case 'REFILL_IN':
          description = `Restocked ${cyl?.serialCode} from refill`;
          icon = 'inventory';
          colorClass = 'text-indigo-600 bg-indigo-50';
          break;
        case 'DEPOSIT_REFUND':
          description = `Refunded deposit to ${member?.companyName}`;
          icon = 'savings';
          colorClass = 'text-purple-600 bg-purple-50';
          break;
        case 'DEBT_PAYMENT':
          description = `Debt payment from ${member?.companyName}`;
          icon = 'payments';
          colorClass = 'text-emerald-600 bg-emerald-50';
          break;
        case 'DELIVERY':
          description = `Dispatched ${cyl?.serialCode} for delivery`;
          icon = 'local_shipping';
          colorClass = 'text-cyan-600 bg-cyan-50';
          break;
      }

      return { ...tx, description, icon, colorClass };
    });

  // -- Low Stock Check --
  const lowStockGases = Object.values(GasType).filter(gas => {
      const avail = cylinders.filter(c => c.gasType === gas && c.status === CylinderStatus.Available).length;
      return avail < 2; // Threshold
  });

  return (
    <div className="space-y-6 animate-fade-in-up">
      
      {/* Header & Alerts */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h1 className="text-2xl font-bold text-gray-800">Dashboard</h1>
           <p className="text-sm text-gray-500">{new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
        </div>
      </div>

      {/* ACTIONABLE ALERTS SECTION */}
      {(lowStockGases.length > 0 || membersReadyForRefund.length > 0) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
               {lowStockGases.length > 0 && (
                   <div className="flex items-center gap-3 bg-red-50 text-red-700 px-5 py-3 rounded-xl border border-red-100 shadow-sm animate-pulse">
                        <div className="p-2 bg-red-100 rounded-lg">
                             <span className="material-icons text-red-600">warning</span>
                        </div>
                        <div>
                             <p className="font-bold text-sm">Low Stock Alert</p>
                             <p className="text-xs">Critical levels for: {lowStockGases.map(g => g.split(' ')[0]).join(', ')}</p>
                        </div>
                   </div>
               )}
               {membersReadyForRefund.length > 0 && (
                   <div onClick={() => navigate('/members')} className="cursor-pointer flex items-center justify-between gap-3 bg-green-50 text-green-700 px-5 py-3 rounded-xl border border-green-100 shadow-sm hover:bg-green-100 transition-colors">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-green-100 rounded-lg">
                                <span className="material-icons text-green-600">savings</span>
                            </div>
                            <div>
                                <p className="font-bold text-sm">Refunds Ready</p>
                                <p className="text-xs">{membersReadyForRefund.length} members completed waiting period.</p>
                            </div>
                        </div>
                        <span className="material-icons text-green-400">chevron_right</span>
                   </div>
               )}
          </div>
      )}

      {/* Stats Cards Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
          <div className="p-3 bg-indigo-50 text-indigo-600 rounded-lg">
             <span className="material-icons text-2xl">inventory_2</span>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Total Assets</p>
            <p className="text-2xl font-bold text-gray-800">{totalCylinders}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-lg">
             <span className="material-icons text-2xl">pie_chart</span>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Utilization Rate</p>
            <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-gray-800">{utilizationRate}%</p>
                <span className="text-xs text-gray-400">rented</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
          <div className="p-3 bg-green-50 text-green-600 rounded-lg">
             <span className="material-icons text-2xl">check_circle</span>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Available Now</p>
            <p className="text-2xl font-bold text-gray-800">{availableCylinders}</p>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
          <div className="p-3 bg-orange-50 text-orange-600 rounded-lg">
             <span className="material-icons text-2xl">local_gas_station</span>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Needs Refill</p>
            <p className="text-2xl font-bold text-gray-800">{needRefill}</p>
          </div>
        </div>

        {/* Long Term Rentals Card */}
        <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-100 flex items-center gap-4 transition-transform hover:-translate-y-1">
          <div className="p-3 bg-purple-50 text-purple-600 rounded-lg">
             <span className="material-icons text-2xl">watch_later</span>
          </div>
          <div>
            <p className="text-sm text-gray-500 font-medium">Long Term Rent</p>
            <div className="flex items-baseline gap-2">
                <p className="text-2xl font-bold text-gray-800">{longTermRentalsCount}</p>
                <span className="text-xs text-purple-400 font-medium">{'>'} 2 mo</span>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Charts Section (Left 2 cols) */}
        <div className="lg:col-span-2 space-y-6">
            
            {/* Long Duration Rentals List (New Feature) */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="p-6 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="material-icons text-red-500 text-sm">history_toggle_off</span>
                        Long Duration Rentals
                    </h3>
                    <div className="flex bg-gray-100 p-1 rounded-lg">
                        <button 
                            onClick={() => setOverdueFilter('3m')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${overdueFilter === '3m' ? 'bg-white text-gray-800 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {'>'} 3 Months
                        </button>
                        <button 
                            onClick={() => setOverdueFilter('6m')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${overdueFilter === '6m' ? 'bg-white text-orange-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {'>'} 6 Months
                        </button>
                        <button 
                            onClick={() => setOverdueFilter('12m')}
                            className={`px-3 py-1 text-xs font-bold rounded-md transition-all ${overdueFilter === '12m' ? 'bg-white text-red-600 shadow-sm' : 'text-gray-500 hover:text-gray-700'}`}
                        >
                            {'>'} 1 Year
                        </button>
                    </div>
                </div>
                
                {filteredOverdue.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm">
                            <thead className="bg-gray-50 text-gray-500 font-medium">
                                <tr>
                                    <th className="px-6 py-3">Asset</th>
                                    <th className="px-6 py-3">Customer</th>
                                    <th className="px-6 py-3">Rented Date</th>
                                    <th className="px-6 py-3 text-right">Duration</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {filteredOverdue.slice(0, 5).map(item => (
                                    <tr key={item.id} className="hover:bg-gray-50 group">
                                        <td className="px-6 py-3">
                                            <p className="font-bold font-mono text-gray-800 text-xs">{item.serialCode}</p>
                                            <p className="text-[10px] text-gray-500">{item.gasType}</p>
                                        </td>
                                        <td className="px-6 py-3 text-gray-700 text-xs font-medium">
                                            {item.member?.companyName || 'Unknown'}
                                        </td>
                                        <td className="px-6 py-3 text-gray-500 text-xs">
                                            {new Date(item.rentDate).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-3 text-right">
                                            <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                                item.days > 365 ? 'bg-red-100 text-red-700' : 
                                                item.days > 180 ? 'bg-orange-100 text-orange-700' : 
                                                'bg-yellow-100 text-yellow-800'
                                            }`}>
                                                {item.days} days
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredOverdue.length > 5 && (
                            <div className="p-2 text-center border-t border-gray-100 bg-gray-50">
                                <button onClick={() => navigate('/inventory')} className="text-xs text-indigo-600 font-bold hover:underline">
                                    View all {filteredOverdue.length} overdue items
                                </button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="p-8 text-center text-gray-400 text-sm bg-white">
                        <span className="material-icons text-3xl mb-2 text-green-200">check_circle</span>
                        <p>No cylinders found matching this duration.</p>
                    </div>
                )}
            </div>

            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-lg font-bold text-gray-800 mb-6 flex items-center gap-2">
                    <span className="material-icons text-gray-400 text-sm">bar_chart</span>
                    Inventory Levels
                </h3>
                <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="name" tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <YAxis tick={{fontSize: 12, fill: '#64748b'}} axisLine={false} tickLine={false} />
                        <Tooltip 
                            contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                            cursor={{fill: '#f8fafc'}}
                        />
                        <Legend iconType="circle" wrapperStyle={{paddingTop: '10px'}}/>
                        <Bar dataKey="Total" fill="#e2e8f0" radius={[4, 4, 0, 0]} barSize={30} />
                        <Bar dataKey="Available" fill="#22c55e" radius={[4, 4, 0, 0]} barSize={30} />
                    </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Activity Feed */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                        <span className="material-icons text-gray-400 text-sm">history</span>
                        Recent Activity
                    </h3>
                    <button className="text-sm text-indigo-600 hover:text-indigo-800 font-medium">View All</button>
                </div>
                <div className="space-y-4">
                    {recentTransactions.length > 0 ? (
                        recentTransactions.map(tx => (
                            <div key={tx.id} className="flex items-start gap-4 pb-4 border-b border-gray-50 last:border-0 last:pb-0">
                                <div className={`p-2 rounded-full flex-shrink-0 mt-1 ${tx.colorClass}`}>
                                    <span className="material-icons text-sm">{tx.icon}</span>
                                </div>
                                <div>
                                    <p className="text-sm font-medium text-gray-800">{tx.description}</p>
                                    <p className="text-xs text-gray-400 mt-1">
                                        {new Date(tx.date).toLocaleDateString()} • {new Date(tx.date).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                                    </p>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="text-center text-gray-400 py-6 text-sm">No recent activity</div>
                    )}
                </div>
            </div>
        </div>

        {/* Right Column: Quick Actions & Secondary Charts */}
        <div className="space-y-6">
            
            {/* Quick Actions Panel */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Quick Actions</h3>
                <div className="grid grid-cols-2 gap-3">
                    <button 
                        onClick={() => navigate('/rental')} 
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors border border-blue-100"
                    >
                        <span className="material-icons mb-2">shopping_cart</span>
                        <span className="text-sm font-semibold">Rent Out</span>
                    </button>
                    <button 
                        onClick={() => navigate('/rental')} 
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-green-50 text-green-700 hover:bg-green-100 transition-colors border border-green-100"
                    >
                        <span className="material-icons mb-2">assignment_return</span>
                        <span className="text-sm font-semibold">Return</span>
                    </button>
                    <button 
                        onClick={() => navigate('/delivery')} 
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-orange-50 text-orange-700 hover:bg-orange-100 transition-colors border border-orange-100"
                    >
                        <span className="material-icons mb-2">local_shipping</span>
                        <span className="text-sm font-semibold">Delivery</span>
                    </button>
                    <button 
                        onClick={() => navigate('/inventory')} 
                        className="flex flex-col items-center justify-center p-4 rounded-xl bg-gray-50 text-gray-700 hover:bg-gray-100 transition-colors border border-gray-200"
                    >
                        <span className="material-icons mb-2">add_box</span>
                        <span className="text-sm font-semibold">Add Stock</span>
                    </button>
                </div>
            </div>

            {/* Pie Chart: Status Distribution */}
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col items-center">
                <h3 className="text-lg font-bold text-gray-800 mb-2 w-full text-left">Asset Status</h3>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie
                                data={pieData}
                                cx="50%"
                                cy="50%"
                                innerRadius={40}
                                outerRadius={70}
                                paddingAngle={5}
                                dataKey="value"
                            >
                                {pieData.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                ))}
                            </Pie>
                            <Tooltip contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }} />
                            <Legend verticalAlign="bottom" height={36} iconType="circle" />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>

      </div>
    </div>
  );
};

export default Dashboard;