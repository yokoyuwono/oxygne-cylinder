
import React, { useState, useEffect } from 'react';
import { Member, MemberPrice, GasType, CylinderSize, Transaction, Cylinder, MemberStatus } from '../types';

interface MembersViewProps {
  members: Member[];
  prices: MemberPrice[];
  onUpdatePrices?: (prices: MemberPrice[]) => void;
  transactions: Transaction[];
  cylinders: Cylinder[];
  onAddMember: (member: Member) => void;
  onUpdateMember: (member: Member) => void;
  onDeleteMember: (id: string) => void;
  onPayDebt: (id: string, amount: number, billIds: string[]) => void;
  onRequestExit: (id: string) => void;
  onProcessRefund: (id: string, amount: number) => void;
}

const MembersView: React.FC<MembersViewProps> = ({ 
  members, prices, onUpdatePrices, transactions, cylinders,
  onAddMember, onUpdateMember, onDeleteMember, onPayDebt, onRequestExit, onProcessRefund
}) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pricing' | 'history'>('pricing');
  const [isAddingPrice, setIsAddingPrice] = useState(false);

  // -- Search State --
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filterDebtOnly, setFilterDebtOnly] = useState(false);

  // -- Member CRUD Modal State --
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [isEditingMember, setIsEditingMember] = useState(false);
  const [currentMember, setCurrentMember] = useState<Partial<Member>>({});
  
  // -- New Member Deposit State --
  const [memberType, setMemberType] = useState<'returning' | 'new'>('returning');
  const [depositConfig, setDepositConfig] = useState({
      qty6m3: 0,
      qty1m3: 0,
      qtyRegulator: 0
  });

  // -- Delete Confirmation State --
  const [isDeleteMemberModalOpen, setIsDeleteMemberModalOpen] = useState(false);
  const [priceToDelete, setPriceToDelete] = useState<string | null>(null);

  // -- Exit Membership State --
  const [isExitModalOpen, setIsExitModalOpen] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);

  // -- Inline Pricing Edit State --
  const [editingPriceId, setEditingPriceId] = useState<string | null>(null);
  const [editPriceValue, setEditPriceValue] = useState<string>('');

  // -- Bulk Update State --
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  const [bulkPercentage, setBulkPercentage] = useState<string>('0');

  // -- Pay Debt State --
  const [isPayDebtModalOpen, setIsPayDebtModalOpen] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);

  // Debounce Effect
  useEffect(() => {
    const handler = setTimeout(() => {
        setDebouncedSearchQuery(searchQuery);
    }, 300);

    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Filter Members based on debounced query
  const filteredMembers = members.filter(m => {
    const matchesSearch = m.companyName.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) || 
                          m.name.toLowerCase().includes(debouncedSearchQuery.toLowerCase()) ||
                          m.address.toLowerCase().includes(debouncedSearchQuery.toLowerCase());
    const matchesDebt = filterDebtOnly ? m.totalDebt > 0 : true;
    return matchesSearch && matchesDebt;
  });

  // Initialize selected member ONLY on desktop if none selected
  useEffect(() => {
    const isDesktop = window.innerWidth >= 1024;
    if (isDesktop && !selectedMemberId && filteredMembers.length > 0) {
        setSelectedMemberId(filteredMembers[0].id);
    }
  }, [filteredMembers]);

  // Derived state
  const selectedMember = members.find(m => m.id === selectedMemberId);
  const memberPrices = prices.filter(p => p.memberId === selectedMemberId);
  
  // -- Helper for Currency --
  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  // -- Helper for Initials --
  const getInitials = (name: string) => {
      return name
        .split(' ')
        .map(n => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase();
  };

  const getRandomColor = (id: string) => {
      const colors = ['bg-blue-500', 'bg-indigo-500', 'bg-purple-500', 'bg-pink-500', 'bg-teal-500', 'bg-orange-500'];
      const index = id.charCodeAt(id.length - 1) % colors.length;
      return colors[index];
  };

  const getStatusBadge = (status: MemberStatus = MemberStatus.Active) => {
      switch(status) {
          case MemberStatus.Active: return 'bg-green-100 text-green-700';
          case MemberStatus.Pending_Exit: return 'bg-orange-100 text-orange-700';
          case MemberStatus.Non_Active: return 'bg-gray-100 text-gray-500';
          default: return 'bg-gray-100 text-gray-500';
      }
  };

  // -- Helper for Deposit Calculation --
  const calculateTotalDeposit = () => {
      const deposit6m3 = depositConfig.qty6m3 * 1000000;
      const deposit1m3 = depositConfig.qty1m3 * 500000;
      const depositReg = depositConfig.qtyRegulator * 250000;
      return deposit6m3 + deposit1m3 + depositReg;
  };

  // -- Helper for Refund Eligibility --
  const getRefundEligibility = (member: Member) => {
      if (member.status !== MemberStatus.Pending_Exit || !member.exitRequestDate) {
          return { isReady: false, daysLeft: 0 };
      }
      
      const requestDate = new Date(member.exitRequestDate);
      const targetDate = new Date(requestDate);
      targetDate.setDate(requestDate.getDate() + 14); // 2 weeks wait

      const now = new Date();
      const diffMs = targetDate.getTime() - now.getTime();
      const daysLeft = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      return {
          isReady: daysLeft <= 0,
          daysLeft: Math.max(0, daysLeft)
      };
  };

  // -- History Logic --
  const memberTransactions = transactions
    .filter(t => t.memberId === selectedMemberId)
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  const activeRentals = cylinders.filter(c => c.currentHolder === selectedMemberId);

  // Get unpaid transactions for debt payment
  const unpaidTransactions = memberTransactions.filter(t => t.paymentStatus === 'UNPAID');

  // Helper to get duration
  const getRentalDuration = (cylinderId: string) => {
    const lastRentTx = transactions
        .filter(t => t.cylinderId === cylinderId && t.memberId === selectedMemberId && t.type === 'RENTAL_OUT')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];

    if (!lastRentTx) return { text: 'Unknown', days: 0, isLongTerm: false };

    const start = new Date(lastRentTx.date);
    const now = new Date();
    const diffMs = now.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    let text = `${diffDays} Days`;
    if (diffDays === 0) text = 'Today';
    if (diffDays > 30) {
        const months = Math.floor(diffDays / 30);
        text = `${months} Month${months > 1 ? 's' : ''} (${diffDays} Days)`;
    }

    return { text, days: diffDays, isLongTerm: diffDays > 30 };
  };

  const getTxColor = (type: string) => {
      switch(type) {
          case 'RENTAL_OUT': return 'text-blue-600 bg-blue-50';
          case 'RETURN': return 'text-green-600 bg-green-50';
          case 'DEBT_PAYMENT': return 'text-orange-600 bg-orange-50';
          case 'DEPOSIT_REFUND': return 'text-purple-600 bg-purple-50';
          default: return 'text-gray-600 bg-gray-50';
      }
  };

  // -- Pricing Logic --
  const [newGasType, setNewGasType] = useState<GasType>(GasType.Oxygen);
  const [newSize, setNewSize] = useState<CylinderSize>(CylinderSize.Large);
  const [newPrice, setNewPrice] = useState<string>('');

  const handleAddPrice = () => {
    if (!selectedMemberId || !newPrice || !onUpdatePrices) return;
    
    const newEntry: MemberPrice = {
        id: `mp-${Date.now()}`,
        memberId: selectedMemberId,
        gasType: newGasType,
        size: newSize,
        price: parseFloat(newPrice)
    };
    onUpdatePrices([...prices, newEntry]);
    setNewPrice('');
    setIsAddingPrice(false);
  };

  const startEditingPrice = (priceId: string, currentVal: number) => {
      setEditingPriceId(priceId);
      setEditPriceValue(currentVal.toString());
  };

  const cancelEditingPrice = () => {
      setEditingPriceId(null);
      setEditPriceValue('');
  };

  const saveEditingPrice = (priceId: string) => {
      if (!onUpdatePrices || !editPriceValue) return;
      const numVal = parseFloat(editPriceValue);
      if (isNaN(numVal) || numVal < 0) {
          alert("Invalid price");
          return;
      }
      const updatedPrices = prices.map(p => p.id === priceId ? { ...p, price: numVal } : p);
      onUpdatePrices(updatedPrices);
      setEditingPriceId(null);
  };

  const confirmDeletePrice = () => {
      if (!onUpdatePrices || !priceToDelete) return;
      onUpdatePrices(prices.filter(p => p.id !== priceToDelete));
      setPriceToDelete(null);
  };

  const handleBulkUpdate = () => {
      if (!onUpdatePrices || !selectedMemberId) return;
      const percent = parseFloat(bulkPercentage);
      if (isNaN(percent) || percent === 0) return;
      const factor = 1 + (percent / 100);
      const updatedPrices = prices.map(p => {
          if (p.memberId === selectedMemberId) {
              return { ...p, price: Math.round(p.price * factor) };
          }
          return p;
      });
      onUpdatePrices(updatedPrices);
      setIsBulkModalOpen(false);
  };

  const openPayDebtModal = () => {
      if (!selectedMember) return;
      setSelectedBillIds([]);
      setIsPayDebtModalOpen(true);
  };

  const toggleBillSelection = (id: string) => {
      if (selectedBillIds.includes(id)) {
          setSelectedBillIds(prev => prev.filter(bid => bid !== id));
      } else {
          setSelectedBillIds(prev => [...prev, id]);
      }
  };

  const handleSelectAllBills = () => {
      if (selectedBillIds.length === unpaidTransactions.length) {
          setSelectedBillIds([]);
      } else {
          setSelectedBillIds(unpaidTransactions.map(t => t.id));
      }
  };

  const calculateSelectedTotal = () => {
      return unpaidTransactions
        .filter(t => selectedBillIds.includes(t.id))
        .reduce((sum, t) => sum + (t.cost || 0), 0);
  };

  const handleConfirmPayDebt = (e: React.FormEvent) => {
      e.preventDefault();
      if (!selectedMemberId) return;
      const totalAmount = calculateSelectedTotal();
      
      if (totalAmount <= 0) return;
      
      onPayDebt(selectedMemberId, totalAmount, selectedBillIds);
      setIsPayDebtModalOpen(false);
  };

  // -- Member CRUD Handlers --
  const handleOpenAddMember = () => {
    setIsEditingMember(false);
    setCurrentMember({ name: '', companyName: '', address: '', phone: '', totalDeposit: 0, totalDebt: 0 });
    setMemberType('returning');
    setDepositConfig({ qty6m3: 0, qty1m3: 0, qtyRegulator: 0 });
    setIsMemberModalOpen(true);
  };

  const handleOpenEditMember = () => {
    if (!selectedMember) return;
    setIsEditingMember(true);
    setCurrentMember({...selectedMember});
    // Editing members generally doesn't trigger new deposit workflow unless requested
    setMemberType('returning'); 
    setIsMemberModalOpen(true);
  };

  const handleSubmitMember = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentMember.companyName) return;

      if (isEditingMember && currentMember.id) {
          onUpdateMember(currentMember as Member);
      } else {
          // Calculate initial deposit
          let depositAmount = 0;
          if (memberType === 'new') {
              depositAmount = calculateTotalDeposit();
          }

          const newMember: Member = {
              id: `m-${Date.now()}`,
              companyName: currentMember.companyName!,
              name: currentMember.name || '',
              address: currentMember.address || '',
              phone: currentMember.phone || '',
              totalDeposit: depositAmount,
              totalDebt: 0,
              joinDate: new Date().toISOString(),
              status: MemberStatus.Active
          };
          onAddMember(newMember);
          setSelectedMemberId(newMember.id);
      }
      setIsMemberModalOpen(false);
  };

  const confirmDeleteMember = () => {
      if (!selectedMemberId) return;
      onDeleteMember(selectedMemberId);
      setSelectedMemberId(null);
      setIsDeleteMemberModalOpen(false);
  };

  // -- Exit & Refund Handlers --
  const handleConfirmExit = () => {
      if (!selectedMemberId) return;
      onRequestExit(selectedMemberId);
      setIsExitModalOpen(false);
  };

  const handleConfirmRefund = () => {
      if (!selectedMember) return;
      const refundAmount = selectedMember.totalDeposit / 2;
      onProcessRefund(selectedMember.id, refundAmount);
      setIsRefundModalOpen(false);
  };

  // -- RENDER --
  const refundEligibility = selectedMember ? getRefundEligibility(selectedMember) : { isReady: false, daysLeft: 0 };
  
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-140px)] animate-fade-in relative pb-20 md:pb-0">
      
      {/* 
        LEFT COLUMN: Member List 
      */}
      <div className={`w-full lg:w-1/3 bg-white lg:rounded-xl lg:shadow-sm lg:border lg:border-gray-200 flex-col overflow-hidden ${selectedMemberId ? 'hidden lg:flex' : 'flex h-full rounded-xl shadow-sm border border-gray-200'}`}>
        
        {/* Sticky Header with Search */}
        <div className="p-4 border-b border-gray-100 bg-white sticky top-0 z-10 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-800">Members</h2>
            <div className="flex gap-2">
                 <button 
                    onClick={() => setFilterDebtOnly(!filterDebtOnly)}
                    className={`text-xs px-2 py-1 rounded-full border transition-colors ${filterDebtOnly ? 'bg-red-50 text-red-600 border-red-200' : 'bg-gray-50 text-gray-400 border-gray-200'}`}
                 >
                     Has Debt
                 </button>
                 <div className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">{members.length} customers</div>
            </div>
          </div>
          <div className="relative">
                <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                <input 
                    type="text" 
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name, company..." 
                    className="w-full pl-9 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:bg-white focus:ring-2 focus:ring-indigo-500 outline-none transition-colors"
                />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto">
          {filteredMembers.length > 0 ? (
              filteredMembers.map(member => {
                const isActive = selectedMemberId === member.id;
                return (
                    <div 
                    key={member.id}
                    onClick={() => setSelectedMemberId(member.id)}
                    className={`p-4 border-b border-gray-50 cursor-pointer transition-colors hover:bg-gray-50 flex items-center gap-4 ${isActive ? 'bg-indigo-50 border-l-4 border-l-indigo-600' : 'border-l-4 border-l-transparent'}`}
                    >
                    {/* Avatar */}
                    <div className={`w-10 h-10 rounded-full text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-sm ${getRandomColor(member.id)}`}>
                        {getInitials(member.companyName)}
                    </div>

                    <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-center">
                            <h3 className={`font-bold truncate ${isActive ? 'text-indigo-900' : 'text-gray-800'}`}>
                                {member.companyName}
                            </h3>
                            {member.status !== MemberStatus.Active && (
                                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold uppercase ${getStatusBadge(member.status)}`}>
                                    {member.status === MemberStatus.Pending_Exit ? 'Exiting' : 'Inactive'}
                                </span>
                            )}
                        </div>
                        <p className="text-sm text-gray-500 truncate">{member.name}</p>
                    </div>
                    
                    <span className="material-icons text-gray-300 text-sm">chevron_right</span>
                    </div>
                );
              })
          ) : (
            <div className="flex flex-col items-center justify-center h-48 text-gray-400 text-sm px-6 text-center">
                <span className="material-icons text-3xl mb-2 text-gray-300">search_off</span>
                <p>No members found matching "{debouncedSearchQuery}"</p>
            </div>
          )}
        </div>
        
        {/* Desktop Add Button (Footer) */}
        <div className="hidden lg:block p-4 border-t border-gray-100 bg-gray-50">
             <button 
                onClick={handleOpenAddMember}
                className="w-full py-2 bg-white border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50 hover:text-indigo-600 transition-colors flex items-center justify-center gap-2"
            >
                <span className="material-icons text-sm">add</span>
                Add New Member
            </button>
        </div>
      </div>

      {/* 
        RIGHT COLUMN: Details & Pricing 
      */}
      <div className={`flex-1 bg-white lg:rounded-xl lg:shadow-sm lg:border lg:border-gray-200 flex-col overflow-hidden h-full ${selectedMemberId ? 'flex fixed inset-0 z-40 lg:static' : 'hidden lg:flex'}`}>
        {selectedMember ? (
          <>
            {/* Mobile Header: Back Button */}
            <div className="lg:hidden bg-indigo-600 text-white p-4 flex items-center gap-3 shadow-md shrink-0">
                <button onClick={() => setSelectedMemberId(null)} className="p-1 hover:bg-indigo-500 rounded-full transition-colors">
                    <span className="material-icons">arrow_back</span>
                </button>
                <span className="font-bold truncate">{selectedMember.companyName}</span>
                <div className="ml-auto flex gap-2">
                     <button onClick={handleOpenEditMember} className="p-1 hover:bg-indigo-500 rounded"><span className="material-icons text-sm">edit</span></button>
                </div>
            </div>

            {/* Desktop Header */}
            <div className="hidden lg:block p-6 border-b border-gray-100 pb-0 shrink-0">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-4">
                     <div className={`w-16 h-16 rounded-xl text-white flex items-center justify-center font-bold text-2xl shadow-md ${getRandomColor(selectedMember.id)}`}>
                        {getInitials(selectedMember.companyName)}
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h1 className="text-2xl font-bold text-gray-900">{selectedMember.companyName}</h1>
                            {selectedMember.status !== MemberStatus.Active && (
                                <span className={`text-xs px-2 py-1 rounded-full font-bold uppercase tracking-wide ${getStatusBadge(selectedMember.status)}`}>
                                    {selectedMember.status}
                                </span>
                            )}
                        </div>
                        <p className="text-gray-500 text-sm flex items-center gap-1 mt-1">
                            <span className="material-icons text-xs">person</span> {selectedMember.name}
                        </p>
                    </div>
                </div>
                <div className="flex gap-2">
                    {/* Action Buttons */}
                    {selectedMember.status === MemberStatus.Active ? (
                         <>
                            <button 
                                onClick={handleOpenEditMember}
                                className="px-3 py-1.5 text-gray-600 border border-gray-300 rounded-lg hover:bg-gray-50 text-sm font-medium transition-colors flex items-center gap-1"
                            >
                                <span className="material-icons text-sm">edit</span> Edit
                            </button>
                            <button 
                                onClick={() => setIsExitModalOpen(true)}
                                className="px-3 py-1.5 text-orange-600 border border-orange-200 rounded-lg hover:bg-orange-50 text-sm font-medium transition-colors flex items-center gap-1"
                                title="Leave Membership"
                            >
                                <span className="material-icons text-sm">exit_to_app</span> Leave
                            </button>
                         </>
                    ) : selectedMember.status === MemberStatus.Pending_Exit ? (
                        <button 
                            onClick={() => setIsRefundModalOpen(true)}
                            disabled={!refundEligibility.isReady}
                            className={`px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 border transition-colors ${
                                refundEligibility.isReady 
                                ? 'bg-green-600 text-white border-green-700 hover:bg-green-700 shadow-sm' 
                                : 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            }`}
                        >
                            <span className="material-icons text-sm">savings</span> 
                            {refundEligibility.isReady ? 'Process Refund' : `Wait ${refundEligibility.daysLeft} days`}
                        </button>
                    ) : (
                        <span className="px-3 py-1.5 bg-gray-100 text-gray-500 rounded-lg text-sm border border-gray-200">Archived</span>
                    )}
                </div>
              </div>
              
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 text-sm mb-6">
                 <div className="col-span-2 bg-gray-50 p-4 rounded-xl border border-gray-100">
                    <div className="flex items-start gap-2 mb-2">
                        <span className="material-icons text-gray-400 text-sm mt-0.5">place</span>
                        <span className="text-gray-600">{selectedMember.address}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="material-icons text-gray-400 text-sm">phone</span>
                        <span className="text-gray-600">{selectedMember.phone}</span>
                    </div>
                 </div>
                 
                 {/* Deposit Card */}
                 <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-16 h-16 bg-indigo-50 rounded-bl-full -mr-6 -mt-6"></div>
                     <p className="text-xs text-gray-500 font-bold uppercase mb-1">Security Deposit</p>
                     <p className="text-xl font-bold text-indigo-700">{formatIDR(selectedMember.totalDeposit || 0)}</p>
                     <span className="material-icons absolute bottom-2 right-2 text-indigo-100 text-4xl group-hover:text-indigo-200 transition-colors">lock</span>
                 </div>

                 {/* Debt Card */}
                 <div className="bg-white p-4 rounded-xl border border-red-100 shadow-sm relative overflow-hidden group">
                     <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-6 -mt-6"></div>
                     <p className="text-xs text-gray-500 font-bold uppercase mb-1">Total Debt</p>
                     <p className={`text-xl font-bold ${selectedMember.totalDebt > 0 ? 'text-red-600' : 'text-gray-800'}`}>{formatIDR(selectedMember.totalDebt || 0)}</p>
                     <span className="material-icons absolute bottom-2 right-2 text-red-100 text-4xl group-hover:text-red-200 transition-colors">money_off</span>
                     {selectedMember.totalDebt > 0 && selectedMember.status === MemberStatus.Active && (
                        <button 
                            onClick={openPayDebtModal}
                            className="absolute bottom-2 left-2 text-[10px] bg-red-600 text-white px-2 py-1 rounded shadow hover:bg-red-700 z-10"
                        >
                            Pay Debt
                        </button>
                     )}
                 </div>
              </div>

              {/* Pending Exit Banner */}
              {selectedMember.status === MemberStatus.Pending_Exit && (
                  <div className="mb-6 bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
                      <span className="material-icons text-orange-500 mt-0.5">timer</span>
                      <div>
                          <h4 className="font-bold text-orange-900 text-sm">Membership Cancellation Requested</h4>
                          <p className="text-orange-800 text-xs mt-1">
                              Request Date: {new Date(selectedMember.exitRequestDate!).toLocaleDateString()}. 
                              Deposit refund available after 14 days cooling period.
                          </p>
                          <div className="mt-2 text-xs font-bold text-orange-700">
                             Status: {refundEligibility.isReady ? 'Refund Ready to Process' : `${refundEligibility.daysLeft} days remaining`}
                          </div>
                      </div>
                  </div>
              )}

              {/* Tabs */}
              <div className="flex gap-6 mt-2">
                <button 
                  onClick={() => setActiveTab('pricing')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'pricing' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  Pricing
                </button>
                <button 
                  onClick={() => setActiveTab('history')}
                  className={`pb-3 text-sm font-bold border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'history' ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                  History
                </button>
              </div>
            </div>

            {/* Mobile Header Info (Below Navbar) */}
            <div className="lg:hidden p-4 bg-gray-50 border-b border-gray-200 shrink-0">
                 <div className="flex flex-col gap-2 text-sm">
                     <div className="flex justify-between items-center mb-2">
                        {selectedMember.status !== MemberStatus.Active && (
                                <span className={`text-[10px] px-2 py-1 rounded-full font-bold uppercase tracking-wide ${getStatusBadge(selectedMember.status)}`}>
                                    {selectedMember.status}
                                </span>
                        )}
                        {selectedMember.status === MemberStatus.Active && (
                             <button onClick={() => setIsExitModalOpen(true)} className="text-xs text-orange-600 underline">Leave Membership</button>
                        )}
                     </div>
                     <div className="flex items-center gap-2 text-gray-700">
                         <span className="material-icons text-gray-400 text-sm">phone</span> {selectedMember.phone}
                     </div>
                     <div className="flex items-start gap-2 text-gray-700">
                         <span className="material-icons text-gray-400 text-sm mt-0.5">place</span> {selectedMember.address}
                     </div>
                     <div className="flex gap-2 mt-2">
                         <div className="flex-1 bg-indigo-50 border border-indigo-100 rounded-lg p-2 flex flex-col items-center">
                             <span className="text-xs font-bold text-indigo-800 uppercase">Deposit</span>
                             <span className="font-bold text-indigo-700">{formatIDR(selectedMember.totalDeposit || 0)}</span>
                         </div>
                         <div className="flex-1 bg-red-50 border border-red-100 rounded-lg p-2 flex flex-col items-center relative">
                             <span className="text-xs font-bold text-red-800 uppercase">Debt</span>
                             <span className={`font-bold ${selectedMember.totalDebt > 0 ? 'text-red-700' : 'text-gray-700'}`}>{formatIDR(selectedMember.totalDebt || 0)}</span>
                         </div>
                     </div>
                 </div>
                 <div className="flex mt-4 bg-white rounded-lg p-1 border border-gray-200">
                    <button 
                        onClick={() => setActiveTab('pricing')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'pricing' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                    >
                        Pricing
                    </button>
                    <button 
                        onClick={() => setActiveTab('history')}
                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-colors ${activeTab === 'history' ? 'bg-indigo-50 text-indigo-700 shadow-sm' : 'text-gray-500'}`}
                    >
                        History
                    </button>
                 </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto bg-white lg:bg-gray-50/50 p-4 lg:p-6 pb-20 lg:pb-6">
              
              {/* TAB: PRICING */}
              {activeTab === 'pricing' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="text-base lg:text-lg font-bold text-gray-800">Custom Rates</h3>
                    <div className="flex gap-2">
                         <button 
                            onClick={() => setIsBulkModalOpen(true)}
                            className="p-2 text-gray-500 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-gray-200"
                            title="Bulk Update"
                            disabled={selectedMember.status !== MemberStatus.Active}
                        >
                            <span className="material-icons">published_with_changes</span>
                        </button>
                        <button 
                            onClick={() => setIsAddingPrice(!isAddingPrice)}
                            disabled={selectedMember.status !== MemberStatus.Active}
                            className={`text-xs lg:text-sm font-bold px-3 py-2 rounded-lg flex items-center gap-2 transition-colors shadow-sm ${selectedMember.status !== MemberStatus.Active ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-indigo-600 hover:bg-indigo-700 text-white'}`}
                        >
                            <span className="material-icons text-sm">{isAddingPrice ? 'close' : 'add'}</span>
                            {isAddingPrice ? 'Cancel' : 'Add Rate'}
                        </button>
                    </div>
                  </div>

                  {/* Add New Rate Form */}
                  {isAddingPrice && (
                    <div className="bg-white p-4 rounded-xl border border-indigo-100 shadow-sm animate-fade-in-up">
                      <h4 className="text-xs font-bold text-indigo-900 uppercase tracking-wide mb-3">New Pricing Rule</h4>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <select 
                            value={newGasType}
                            onChange={(e) => setNewGasType(e.target.value as GasType)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                        >
                            {Object.values(GasType).map(g => <option key={g} value={g}>{g}</option>)}
                        </select>
                        <select 
                            value={newSize}
                            onChange={(e) => setNewSize(e.target.value as CylinderSize)}
                            className="border border-gray-300 rounded-lg px-3 py-2 text-sm outline-none bg-white"
                        >
                             {Object.values(CylinderSize).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <div className="relative">
                            <span className="absolute left-3 top-2 text-gray-400 text-xs">Rp</span>
                            <input 
                                type="number" 
                                value={newPrice}
                                onChange={(e) => setNewPrice(e.target.value)}
                                className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm outline-none"
                                placeholder="0"
                            />
                        </div>
                        <button 
                          onClick={handleAddPrice}
                          className="bg-indigo-100 text-indigo-700 hover:bg-indigo-200 font-bold py-2 px-4 rounded-lg text-sm transition-colors"
                        >
                          Save Rule
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pricing List (Responsive) */}
                  <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
                        {memberPrices.length > 0 ? (
                            <div className="divide-y divide-gray-100">
                                {memberPrices.map((price) => (
                                    <div key={price.id} className="p-4 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                                        <div className="flex items-center gap-3">
                                            <div className="w-10 h-10 rounded-lg bg-gray-50 flex items-center justify-center text-gray-500 border border-gray-100">
                                                <span className="material-icons text-lg">local_offer</span>
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800 text-sm">{price.gasType}</p>
                                                <p className="text-xs text-gray-500">{price.size}</p>
                                            </div>
                                        </div>
                                        
                                        <div className="flex items-center gap-4">
                                            {editingPriceId === price.id ? (
                                                <div className="flex items-center gap-2">
                                                    <input 
                                                        type="number"
                                                        value={editPriceValue}
                                                        onChange={(e) => setEditPriceValue(e.target.value)}
                                                        className="w-24 px-2 py-1 border border-indigo-300 rounded text-right font-mono text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                                        autoFocus
                                                    />
                                                    <button onClick={() => saveEditingPrice(price.id)} className="text-green-600 bg-green-50 p-1 rounded hover:bg-green-100">
                                                        <span className="material-icons text-base">check</span>
                                                    </button>
                                                    <button onClick={cancelEditingPrice} className="text-red-500 bg-red-50 p-1 rounded hover:bg-red-100">
                                                        <span className="material-icons text-base">close</span>
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span className="font-bold text-green-700 font-mono">{formatIDR(price.price)}</span>
                                                    {selectedMember.status === MemberStatus.Active && (
                                                        <div className="flex gap-1 lg:opacity-0 group-hover:opacity-100 transition-opacity">
                                                            <button onClick={() => startEditingPrice(price.id, price.price)} className="text-gray-400 hover:text-indigo-600 p-1">
                                                                <span className="material-icons text-lg">edit</span>
                                                            </button>
                                                            <button onClick={() => setPriceToDelete(price.id)} className="text-gray-400 hover:text-red-500 p-1">
                                                                <span className="material-icons text-lg">delete</span>
                                                            </button>
                                                        </div>
                                                    )}
                                                </>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <div className="p-8 text-center text-gray-400">
                                <span className="material-icons text-4xl mb-2 text-gray-200">sell</span>
                                <p className="text-sm">No custom pricing configured.</p>
                                <p className="text-xs mt-1">Standard rates will apply.</p>
                            </div>
                        )}
                  </div>
                </div>
              )}

              {/* TAB: HISTORY */}
              {activeTab === 'history' && (
                  <div className="space-y-6">
                      {/* Active Rentals Summary */}
                      <div>
                          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Active Rentals</h3>
                          {activeRentals.length > 0 ? (
                             <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                {activeRentals.map(c => {
                                    const duration = getRentalDuration(c.id);
                                    return (
                                        <div key={c.id} className="bg-white p-3 rounded-xl border border-gray-200 shadow-sm flex justify-between items-center">
                                            <div>
                                                <p className="font-bold text-gray-800 font-mono text-sm">{c.serialCode}</p>
                                                <p className="text-xs text-gray-500">{c.gasType} ({c.size})</p>
                                            </div>
                                            <div className={`px-2 py-1 rounded text-xs font-medium ${duration.isLongTerm ? 'bg-red-50 text-red-600' : 'bg-gray-100 text-gray-600'}`}>
                                                {duration.text}
                                            </div>
                                        </div>
                                    );
                                })}
                             </div>
                          ) : (
                            <div className="bg-white p-6 rounded-xl border border-gray-200 border-dashed text-center text-gray-400 text-sm">
                                No active rentals.
                            </div>
                          )}
                      </div>

                      {/* Transaction Log */}
                      <div>
                          <h3 className="text-sm font-bold text-gray-500 uppercase tracking-wider mb-3">Activity Log</h3>
                          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                              <div className="divide-y divide-gray-100">
                                  {memberTransactions.length > 0 ? (
                                      memberTransactions.map(tx => {
                                          const cyl = cylinders.find(c => c.id === tx.cylinderId);
                                          return (
                                              <div key={tx.id} className="p-4 hover:bg-gray-50 flex gap-3">
                                                  <div className="mt-1">
                                                      <span className={`w-8 h-8 flex items-center justify-center rounded-full text-xs font-bold ${getTxColor(tx.type)}`}>
                                                          {tx.type === 'RENTAL_OUT' ? 'OUT' : (tx.type === 'RETURN' ? 'IN' : (tx.type === 'DEPOSIT_REFUND' ? 'REF' : 'PAY'))}
                                                      </span>
                                                  </div>
                                                  <div className="flex-1">
                                                      <div className="flex justify-between items-start">
                                                          <p className="text-sm font-medium text-gray-800">
                                                              {tx.type === 'RENTAL_OUT' ? 'Rented' : (tx.type === 'RETURN' ? 'Returned' : (tx.type === 'DEPOSIT_REFUND' ? 'Deposit Refunded' : 'Paid Debt'))} <span className="font-mono">{cyl?.serialCode}</span>
                                                          </p>
                                                          <p className="text-xs text-gray-400 whitespace-nowrap">
                                                              {new Date(tx.date).toLocaleDateString()}
                                                          </p>
                                                      </div>
                                                      <p className="text-xs text-gray-500 mt-0.5">
                                                          {tx.type === 'DEBT_PAYMENT' || tx.type === 'DEPOSIT_REFUND' ? `Amount: ${formatIDR(tx.cost || 0)}` : `${cyl?.gasType} • ${cyl?.size}`}
                                                      </p>
                                                      {tx.paymentStatus && tx.type === 'RENTAL_OUT' && (
                                                          <span className={`text-[10px] px-1.5 py-0.5 rounded uppercase font-bold mt-1 inline-block ${tx.paymentStatus === 'UNPAID' ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-600'}`}>
                                                              {tx.paymentStatus}
                                                          </span>
                                                      )}
                                                  </div>
                                              </div>
                                          );
                                      })
                                  ) : (
                                      <div className="p-8 text-center text-gray-400 text-sm">
                                          No transaction history found.
                                      </div>
                                  )}
                              </div>
                          </div>
                      </div>
                  </div>
              )}

            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400 bg-gray-50/50 h-full p-8 text-center">
            <div className="w-24 h-24 bg-indigo-50 text-indigo-200 rounded-full flex items-center justify-center mb-6">
                <span className="material-icons text-5xl">person_search</span>
            </div>
            <h3 className="text-xl font-bold text-gray-800 mb-2">Select a Member</h3>
            <p className="max-w-xs text-gray-500">Choose a member from the directory list to view their profile, manage custom pricing, or check rental history.</p>
          </div>
        )}
      </div>

      {/* CONFIRM EXIT MODAL */}
      {isExitModalOpen && selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
                  <div className="bg-orange-500 px-6 py-4 border-b border-orange-600 flex justify-between items-center text-white">
                      <h3 className="font-bold flex items-center gap-2">
                          <span className="material-icons">directions_run</span>
                          Leave Membership
                      </h3>
                      <button onClick={() => setIsExitModalOpen(false)} className="text-orange-100 hover:text-white">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-gray-800 font-medium mb-4">
                          Initiate exit process for <strong>{selectedMember.companyName}</strong>?
                      </p>
                      
                      {activeRentals.length > 0 || selectedMember.totalDebt > 0 ? (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                              <p className="text-red-700 font-bold text-sm flex items-center gap-2">
                                  <span className="material-icons text-sm">error</span> Action Blocked
                              </p>
                              <ul className="text-xs text-red-600 mt-2 list-disc pl-5 space-y-1">
                                  {activeRentals.length > 0 && <li>Member still holds {activeRentals.length} active cylinders.</li>}
                                  {selectedMember.totalDebt > 0 && <li>Member has outstanding debt of {formatIDR(selectedMember.totalDebt)}.</li>}
                              </ul>
                              <p className="text-xs text-red-500 mt-2">Please return all items and clear debts before leaving.</p>
                          </div>
                      ) : (
                          <div className="bg-orange-50 border border-orange-100 rounded-lg p-4 mb-4 text-sm text-gray-600">
                              <p className="font-bold text-orange-800 mb-2">Membership Policy:</p>
                              <ul className="list-disc pl-5 space-y-1">
                                  <li>Member status will change to <strong>Pending Exit</strong>.</li>
                                  <li><strong>50%</strong> of the deposit ({formatIDR(selectedMember.totalDeposit / 2)}) will be refunded.</li>
                                  <li>The refund will be processed after a <strong>14-day</strong> cooling period.</li>
                              </ul>
                          </div>
                      )}

                      <div className="flex justify-end gap-3 mt-2">
                          <button 
                              onClick={() => setIsExitModalOpen(false)}
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleConfirmExit}
                              disabled={activeRentals.length > 0 || selectedMember.totalDebt > 0}
                              className="px-4 py-2 bg-orange-500 hover:bg-orange-600 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                          >
                              Confirm Exit Request
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* PROCESS REFUND MODAL */}
      {isRefundModalOpen && selectedMember && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
              <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden animate-fade-in-up">
                  <div className="bg-green-600 px-6 py-4 border-b border-green-700 flex justify-between items-center text-white">
                      <h3 className="font-bold flex items-center gap-2">
                          <span className="material-icons">savings</span>
                          Finalize Refund
                      </h3>
                      <button onClick={() => setIsRefundModalOpen(false)} className="text-green-100 hover:text-white">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6">
                      <div className="text-center mb-6">
                          <p className="text-gray-500 text-sm">Refundable Amount (50%)</p>
                          <p className="text-3xl font-bold text-green-600 mt-1">{formatIDR(selectedMember.totalDeposit / 2)}</p>
                      </div>
                      
                      <div className="bg-gray-50 p-4 rounded-lg text-sm text-gray-600 mb-6">
                          <p>Processing this refund will:</p>
                          <ul className="list-disc pl-5 mt-2 space-y-1 text-xs">
                              <li>Record a <strong>DEPOSIT_REFUND</strong> transaction.</li>
                              <li>Change member status to <strong>Non-Active</strong>.</li>
                              <li>Clear the deposit balance to zero.</li>
                          </ul>
                      </div>

                      <div className="flex justify-end gap-3">
                          <button 
                              onClick={() => setIsRefundModalOpen(false)}
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleConfirmRefund}
                              className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                          >
                              Approve & Pay
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}

      {/* Pay Debt Modal */}
      {isPayDebtModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up flex flex-col max-h-[90vh]">
                <div className="bg-indigo-600 px-6 py-4 border-b border-indigo-700 flex justify-between items-center text-white shrink-0">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">payment</span>
                        Pay Outstanding Bills
                    </h3>
                    <button onClick={() => setIsPayDebtModalOpen(false)} className="text-indigo-200 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                
                <form onSubmit={handleConfirmPayDebt} className="flex-1 flex flex-col min-h-0">
                    <div className="p-6 flex-1 overflow-y-auto">
                        <p className="text-sm text-gray-600 mb-4">
                            Select which unpaid bills you want to clear. Total Debt: <strong>{formatIDR(selectedMember?.totalDebt || 0)}</strong>
                        </p>

                        <div className="border border-gray-200 rounded-lg overflow-hidden mb-4">
                             <div className="bg-gray-50 p-2 flex justify-between items-center border-b border-gray-200">
                                 <div className="flex gap-2">
                                     <button type="button" onClick={handleSelectAllBills} className="text-xs font-bold text-indigo-600 hover:underline px-2">
                                         {selectedBillIds.length === unpaidTransactions.length ? 'Deselect All' : 'Select All'}
                                     </button>
                                 </div>
                                 <span className="text-xs text-gray-500 px-2">{unpaidTransactions.length} unpaid items</span>
                             </div>
                             
                             <div className="max-h-[300px] overflow-y-auto divide-y divide-gray-100">
                                {unpaidTransactions.length > 0 ? (
                                    unpaidTransactions.map(tx => {
                                        const cyl = cylinders.find(c => c.id === tx.cylinderId);
                                        return (
                                            <div 
                                                key={tx.id} 
                                                className={`p-3 flex items-center gap-3 hover:bg-gray-50 cursor-pointer ${selectedBillIds.includes(tx.id) ? 'bg-indigo-50' : ''}`}
                                                onClick={() => toggleBillSelection(tx.id)}
                                            >
                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedBillIds.includes(tx.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                                    {selectedBillIds.includes(tx.id) && <span className="material-icons text-white text-xs">check</span>}
                                                </div>
                                                <div className="flex-1">
                                                    <div className="flex justify-between">
                                                        <span className="text-sm font-bold text-gray-800">{cyl?.serialCode || 'Unknown Item'}</span>
                                                        <span className="text-sm font-mono font-medium">{formatIDR(tx.cost || 0)}</span>
                                                    </div>
                                                    <div className="text-xs text-gray-500">
                                                        {new Date(tx.date).toLocaleDateString()} • {cyl?.gasType}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className="p-8 text-center text-gray-400 text-sm">
                                        No unpaid bills found.
                                    </div>
                                )}
                             </div>
                        </div>

                        <div className="flex justify-end items-center gap-2 text-lg font-bold bg-gray-50 p-3 rounded-lg border border-gray-200">
                            <span className="text-gray-500 text-sm uppercase">Total Payment:</span>
                            <span className="text-indigo-600">{formatIDR(calculateSelectedTotal())}</span>
                        </div>
                    </div>

                    <div className="p-4 border-t border-gray-100 bg-white flex justify-end gap-3 shrink-0">
                        <button 
                            type="button"
                            onClick={() => setIsPayDebtModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            disabled={selectedBillIds.length === 0}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold transition-colors"
                        >
                            Confirm Payment
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

       {/* Member CRUD Modal */}
       {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4 overflow-y-auto py-10">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg overflow-hidden animate-fade-in-up">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 bg-gray-50 z-10">
                    <h3 className="font-bold text-gray-800">{isEditingMember ? 'Edit Member' : 'Add New Member'}</h3>
                    <button onClick={() => setIsMemberModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmitMember} className="p-6 space-y-4">
                    {/* Basic Info */}
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input 
                                type="text" 
                                required
                                value={currentMember.companyName}
                                onChange={(e) => setCurrentMember({...currentMember, companyName: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. PT Maju Jaya"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Person</label>
                                <input 
                                    type="text" 
                                    required
                                    value={currentMember.name}
                                    onChange={(e) => setCurrentMember({...currentMember, name: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input 
                                    type="tel" 
                                    value={currentMember.phone}
                                    onChange={(e) => setCurrentMember({...currentMember, phone: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Address</label>
                            <textarea 
                                value={currentMember.address}
                                onChange={(e) => setCurrentMember({...currentMember, address: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="Full address"
                                rows={2}
                            />
                        </div>
                    </div>

                    {/* Deposit Section - Only for New Members Add Flow */}
                    {!isEditingMember && (
                        <div className="pt-4 border-t border-gray-100">
                             <div className="flex gap-4 mb-4">
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input 
                                        type="radio" 
                                        name="memberType" 
                                        value="returning" 
                                        checked={memberType === 'returning'}
                                        onChange={() => setMemberType('returning')}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                     />
                                     <span className="text-sm font-medium text-gray-700">Returning / Existing</span>
                                 </label>
                                 <label className="flex items-center gap-2 cursor-pointer">
                                     <input 
                                        type="radio" 
                                        name="memberType" 
                                        value="new" 
                                        checked={memberType === 'new'}
                                        onChange={() => setMemberType('new')}
                                        className="text-indigo-600 focus:ring-indigo-500"
                                     />
                                     <span className="text-sm font-medium text-gray-700">Brand New (Deposit)</span>
                                 </label>
                             </div>

                             {memberType === 'new' && (
                                 <div className="bg-indigo-50 p-4 rounded-xl border border-indigo-100 animate-fade-in">
                                     <h4 className="text-xs font-bold text-indigo-800 uppercase tracking-wider mb-3 flex items-center gap-1">
                                         <span className="material-icons text-sm">calculate</span>
                                         Initial Deposit Calculator
                                     </h4>
                                     <div className="space-y-3">
                                         <div className="flex justify-between items-center text-sm">
                                             <span className="text-gray-600">6m³ Cylinder (Rp 1.000.000)</span>
                                             <div className="flex items-center gap-2">
                                                 <input 
                                                    type="number" min="0" 
                                                    value={depositConfig.qty6m3}
                                                    onChange={(e) => setDepositConfig({...depositConfig, qty6m3: parseInt(e.target.value) || 0})}
                                                    className="w-16 px-2 py-1 text-center border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                 />
                                                 <span className="text-xs text-gray-500 w-8">qty</span>
                                             </div>
                                         </div>
                                         <div className="flex justify-between items-center text-sm">
                                             <span className="text-gray-600">1m³ Cylinder (Rp 500.000)</span>
                                             <div className="flex items-center gap-2">
                                                 <input 
                                                    type="number" min="0" 
                                                    value={depositConfig.qty1m3}
                                                    onChange={(e) => setDepositConfig({...depositConfig, qty1m3: parseInt(e.target.value) || 0})}
                                                    className="w-16 px-2 py-1 text-center border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                 />
                                                 <span className="text-xs text-gray-500 w-8">qty</span>
                                             </div>
                                         </div>
                                         <div className="flex justify-between items-center text-sm">
                                             <span className="text-gray-600">Regulator (Rp 250.000)</span>
                                             <div className="flex items-center gap-2">
                                                 <input 
                                                    type="number" min="0" 
                                                    value={depositConfig.qtyRegulator}
                                                    onChange={(e) => setDepositConfig({...depositConfig, qtyRegulator: parseInt(e.target.value) || 0})}
                                                    className="w-16 px-2 py-1 text-center border border-indigo-200 rounded-lg focus:outline-none focus:border-indigo-500"
                                                 />
                                                 <span className="text-xs text-gray-500 w-8">qty</span>
                                             </div>
                                         </div>
                                         
                                         <div className="border-t border-indigo-200 pt-3 mt-2 flex justify-between items-center">
                                             <span className="font-bold text-indigo-900">Total Deposit Due</span>
                                             <span className="font-bold text-lg text-indigo-700">{formatIDR(calculateTotalDeposit())}</span>
                                         </div>
                                     </div>
                                 </div>
                             )}
                        </div>
                    )}
                    
                    <div className="pt-2 flex justify-end gap-3 sticky bottom-0 bg-white">
                        <button 
                            type="button"
                            onClick={() => setIsMemberModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {isEditingMember ? 'Save Changes' : 'Create Member'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* Bulk Update Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">Bulk Adjust Prices</h3>
                    <button onClick={() => setIsBulkModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-sm text-gray-600 mb-4">
                        Apply a percentage adjustment to <strong>{memberPrices.length}</strong> existing custom rates for this member.
                    </p>
                    <div className="mb-4">
                        <label className="block text-xs font-bold text-gray-700 mb-1">Adjustment Percentage (%)</label>
                        <div className="flex items-center gap-2">
                            <input 
                                type="number" 
                                value={bulkPercentage}
                                onChange={(e) => setBulkPercentage(e.target.value)}
                                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="0"
                            />
                            <span className="text-gray-500 text-sm">%</span>
                        </div>
                        <p className="text-xs text-gray-400 mt-1">Use negative values for discounts (e.g. -10)</p>
                    </div>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setIsBulkModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleBulkUpdate}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            Apply Adjustment
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* DELETE MEMBER MODAL */}
      {isDeleteMemberModalOpen && selectedMember && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                <div className="bg-red-600 px-6 py-4 border-b border-red-700 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">warning</span>
                        Delete Member
                    </h3>
                    <button onClick={() => setIsDeleteMemberModalOpen(false)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm mb-4">
                        Are you sure you want to delete <strong>{selectedMember.companyName}</strong>?
                    </p>
                    <p className="text-xs text-red-600 bg-red-50 p-2 rounded mb-4 border border-red-100">
                        This will remove the member from your directory. Their past transaction history will be preserved for audits.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setIsDeleteMemberModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeleteMember}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors"
                        >
                            Delete Member
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* DELETE PRICE MODAL */}
      {priceToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm overflow-hidden animate-fade-in-up">
                <div className="bg-red-600 px-6 py-4 border-b border-red-700 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">delete</span>
                        Remove Rate
                    </h3>
                    <button onClick={() => setPriceToDelete(null)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm mb-4">
                        Are you sure you want to remove this custom price?
                    </p>
                    <p className="text-xs text-gray-500 mb-4">
                        The member will revert to standard pricing for this item type.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setPriceToDelete(null)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeletePrice}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors"
                        >
                            Remove
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

    </div>
  );
};

export default MembersView;
