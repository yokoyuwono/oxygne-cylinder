
import React, { useState, useEffect, useRef } from 'react';
import { Cylinder, CylinderStatus, Member, MemberPrice, Transaction, GasPrice } from '../types';
import { supabase } from '../lib/supabase';

interface RentalFormProps {
  cylinders: Cylinder[];
  members: Member[];
  prices: MemberPrice[];
  gasPrices: GasPrice[];
  transactions: Transaction[];
  onCompleteRental: (memberId: string, rentIds: string[], returnIds: string[], totalCost: number, isUnpaid?: boolean) => void;
}

const RentalForm: React.FC<RentalFormProps> = ({ cylinders, members, prices, gasPrices, transactions, onCompleteRental }) => {
  const [selectedMemberId, setSelectedMemberId] = useState<string>('');
  const [selectedMemberObj, setSelectedMemberObj] = useState<Member | null>(null); // Store selected member object directly
  const [cart, setCart] = useState<Cylinder[]>([]);
  const [returnsList, setReturnsList] = useState<string[]>([]); // IDs of cylinders being returned
  const [error, setError] = useState<string | null>(null);

  // -- UI State --
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);
  const [transactionSource, setTransactionSource] = useState<'TOKO' | 'DELIVERY'>('TOKO');

  // -- Mobile View State --
  const [mobileTab, setMobileTab] = useState<'rent' | 'return'>('rent');

  // -- Member Search State --
  const [memberQuery, setMemberQuery] = useState('');
  const [debouncedMemberQuery, setDebouncedMemberQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<Member[]>([]);
  const [isMemberSearching, setIsMemberSearching] = useState(false);
  const [showMemberMenu, setShowMemberMenu] = useState(false);
  const [highlightedMemberIdx, setHighlightedMemberIdx] = useState(0);
  const memberInputRef = useRef<HTMLInputElement>(null);

  // -- Cylinder Search State --
  const [scanInput, setScanInput] = useState('');
  const [serverSuggestions, setServerSuggestions] = useState<Cylinder[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showCylinderMenu, setShowCylinderMenu] = useState(false);
  const [highlightedCylinderIdx, setHighlightedCylinderIdx] = useState(0);
  const cylinderInputRef = useRef<HTMLInputElement>(null);

  // Helper for IDR
  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
      setFeedback({ msg, type });
      setTimeout(() => setFeedback(null), 3000);
  };

  // Debounce Effect for Member Search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedMemberQuery(memberQuery);
    }, 300);
    return () => clearTimeout(handler);
  }, [memberQuery]);

  // -- Server-Side Member Search Effect --
  useEffect(() => {
    // If menu is closed and query is empty, we might not need to fetch, 
    // but fetching initials is good for UX when focusing.
    if (!showMemberMenu && !debouncedMemberQuery) return;

    const fetchMembers = async () => {
        setIsMemberSearching(true);
        try {
            let query = supabase.from('members').select('*').limit(10);
            
            if (debouncedMemberQuery) {
                // ILIKE for case insensitive search on multiple fields
                query = query.or(`companyName.ilike.%${debouncedMemberQuery}%,name.ilike.%${debouncedMemberQuery}%,address.ilike.%${debouncedMemberQuery}%`);
            } else {
                // Default view (e.g. recently active or alphabetical)
                query = query.order('companyName', { ascending: true });
            }

            const { data } = await query;
            if (data) {
                setMemberSearchResults(data);
            }
        } catch (err) {
            console.error("Error searching members:", err);
        } finally {
            setIsMemberSearching(false);
        }
    };

    fetchMembers();
  }, [debouncedMemberQuery, showMemberMenu]);

  // -- Server-Side Cylinder Search Effect --
  useEffect(() => {
    const query = scanInput.trim();
    if (!query) {
        setServerSuggestions([]);
        return;
    }

    const handler = setTimeout(async () => {
        setIsSearching(true);
        try {
            const { data } = await supabase
                .from('cylinders')
                .select('*')
                .eq('status', CylinderStatus.Available)
                .or(`serialCode.ilike.%${query}%,gasType.ilike.%${query}%`)
                .limit(10); // Limit results for performance

            if (data) {
                // Filter out items already in cart locally
                const available = data.filter(c => !cart.some(item => item.id === c.id));
                setServerSuggestions(available);
            }
        } catch (err) {
            console.error("Error searching cylinders:", err);
        } finally {
            setIsSearching(false);
        }
    }, 300);

    return () => clearTimeout(handler);
  }, [scanInput, cart]);

  // Derived Data
  const selectedMember = selectedMemberObj || members.find(m => m.id === selectedMemberId);

  const memberHeldCylinders = selectedMemberId 
    ? cylinders.filter(c => c.currentHolder === selectedMemberId)
    : [];

  // --- Helpers ---

  const getPrice = (cylinder: Cylinder, memberId: string): { price: number; isCustom: boolean } => {
    // 1. Check for custom member-specific pricing first
    const customPrice = prices.find(
      p => p.memberId === memberId && p.gasType === cylinder.gasType && p.size === cylinder.size
    );
    if (customPrice) return { price: customPrice.price, isCustom: true };
    
    // 2. Fallback to base prices from database
    const basePrice = gasPrices.find(
      p => p.gasType === cylinder.gasType && p.size === cylinder.size
    );
    
    if (basePrice) {
        return { price: basePrice.price, isCustom: false };
    }
    
    return { price: 0, isCustom: false };
  };

  const getHeldDuration = (cylinderId: string) => {
    if (!selectedMemberId) return { days: 0, text: '-', isLongTerm: false };
    const lastRentTx = transactions
        .filter(t => t.cylinderId === cylinderId && t.memberId === selectedMemberId && t.type === 'RENTAL_OUT')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    if (!lastRentTx) return { days: 0, text: 'Unknown', isLongTerm: false };

    const diffMs = new Date().getTime() - new Date(lastRentTx.date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    return { 
        days: diffDays, 
        text: diffDays === 0 ? 'Today' : `${diffDays} Day${diffDays > 1 ? 's' : ''}`,
        isLongTerm: diffDays > 30
    };
  };

  const addToCart = (cylinder: Cylinder) => {
    setCart([...cart, cylinder]);
    setScanInput('');
    setShowCylinderMenu(false);
    setError(null);
    cylinderInputRef.current?.focus();
    setMobileTab('rent'); // Switch to rent tab to see added item
  };

  // --- Handlers ---

  const handleMemberSelect = (member: Member) => {
    setSelectedMemberId(member.id);
    setSelectedMemberObj(member);
    setMemberQuery(member.companyName);
    setDebouncedMemberQuery(member.companyName);
    setShowMemberMenu(false);
    setError(null);
    setReturnsList([]); 
    // Automatically focus scanner after member selection
    setTimeout(() => cylinderInputRef.current?.focus(), 100);
  };

  const handleMemberKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedMemberIdx(prev => (prev < memberSearchResults.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedMemberIdx(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (showMemberMenu && memberSearchResults.length > 0) {
        handleMemberSelect(memberSearchResults[highlightedMemberIdx]);
      }
    } else if (e.key === 'Escape') {
      setShowMemberMenu(false);
    }
  };

  const handleScanSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    if (showCylinderMenu && serverSuggestions.length > 0) {
      addToCart(serverSuggestions[highlightedCylinderIdx]);
      return;
    }

    const code = scanInput.trim().toUpperCase();
    if (!code) return;

    if (cart.find(c => c.serialCode === code)) {
      setError(`Cylinder ${code} is already in the cart.`);
      setScanInput('');
      return;
    }

    // Verify exact code with server
    setIsSearching(true);
    try {
        const { data, error } = await supabase
            .from('cylinders')
            .select('*')
            .eq('serialCode', code)
            .maybeSingle();

        if (error && error.code !== 'PGRST116') throw error;

        if (!data) {
          setError(`Cylinder ${code} not found.`);
        } else if (data.status !== CylinderStatus.Available) {
          setError(`Cylinder ${code} is ${data.status}.`);
        } else {
          addToCart(data);
        }
    } catch (err) {
        console.error(err);
        setError("Error checking cylinder status.");
    } finally {
        setIsSearching(false);
    }
  };

  const handleCylinderKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!showCylinderMenu) setShowCylinderMenu(true);
      setHighlightedCylinderIdx(prev => (prev < serverSuggestions.length - 1 ? prev + 1 : prev));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCylinderIdx(prev => (prev > 0 ? prev - 1 : 0));
    } else if (e.key === 'Escape') {
      setShowCylinderMenu(false);
    } 
  };

  const removeFromCart = (id: string) => {
    setCart(cart.filter(c => c.id !== id));
  };

  const toggleReturn = (id: string) => {
    if (returnsList.includes(id)) {
      setReturnsList(returnsList.filter(r => r !== id));
    } else {
      setReturnsList([...returnsList, id]);
    }
  };

  const handleCheckoutClick = () => {
    if (!selectedMemberId) return;
    if (cart.length === 0 && returnsList.length === 0) return;
    setIsConfirmOpen(true);
  };

  const confirmTransaction = (isUnpaid: boolean = false) => {
    if (!selectedMemberId) return;
    
    const totalCost = cart.reduce((sum, item) => sum + getPrice(item, selectedMemberId).price, 0);
    
    onCompleteRental(selectedMemberId, cart.map(c => c.id), returnsList, totalCost, isUnpaid);
    
    // Reset
    setCart([]);
    setReturnsList([]);
    setSelectedMemberId('');
    setSelectedMemberObj(null);
    setMemberQuery('');
    setDebouncedMemberQuery('');
    setError(null);
    setIsConfirmOpen(false);
    showFeedback(isUnpaid ? `Rental recorded. Added ${formatIDR(totalCost)} to debt.` : `Transaction successful. Paid ${formatIDR(totalCost)}.`);
  };

  const totalCost = selectedMemberId 
    ? cart.reduce((sum, item) => sum + getPrice(item, selectedMemberId).price, 0)
    : 0;

  useEffect(() => setHighlightedMemberIdx(0), [debouncedMemberQuery]);
  useEffect(() => setHighlightedCylinderIdx(0), [scanInput]);

  // --- RENDER ---

  // MODE 1: START (No Member Selected)
  if (!selectedMemberId) {
    return (
      <div className="flex flex-col items-center justify-center h-full animate-fade-in-up p-4 relative">
        {feedback && (
          <div className={`absolute top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              <span className="material-icons text-lg">{feedback.type === 'success' ? 'check_circle' : 'error'}</span>
              <span className="font-medium text-sm">{feedback.msg}</span>
          </div>
        )}

        <div className="w-full max-w-xl bg-white rounded-2xl shadow-xl border border-gray-100 p-6 md:p-10 text-center">
            <div className="w-16 h-16 bg-indigo-50 text-indigo-600 rounded-full flex items-center justify-center mx-auto mb-6">
                <span className="material-icons text-3xl">point_of_sale</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 mb-2">New Transaction</h1>
            <p className="text-gray-500 mb-8 text-sm md:text-base">Select a customer to begin renting or processing returns.</p>
            
            <div className="flex justify-center mb-6">
                <div className="bg-gray-100 p-1.5 rounded-xl flex gap-1">
                    <button
                        onClick={() => setTransactionSource('TOKO')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${transactionSource === 'TOKO' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <span className="material-icons text-lg">store</span>
                        Store (Toko)
                    </button>
                    <button
                        onClick={() => setTransactionSource('DELIVERY')}
                        className={`px-6 py-2.5 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${transactionSource === 'DELIVERY' ? 'bg-white text-indigo-600 shadow-sm' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-200/50'}`}
                    >
                        <span className="material-icons text-lg">local_shipping</span>
                        Delivery
                    </button>
                </div>
            </div>

            <div className="relative text-left">
                <input 
                  ref={memberInputRef}
                  type="text"
                  value={memberQuery}
                  onChange={(e) => {
                    setMemberQuery(e.target.value);
                    setShowMemberMenu(true);
                  }}
                  onFocus={() => setShowMemberMenu(true)}
                  onBlur={() => setTimeout(() => setShowMemberMenu(false), 200)}
                  onKeyDown={handleMemberKeyDown}
                  placeholder="Search member..."
                  className="w-full border-2 border-indigo-100 hover:border-indigo-300 focus:border-indigo-600 rounded-xl pl-12 pr-4 py-4 text-base md:text-lg shadow-sm outline-none transition-all"
                  autoComplete="off"
                  autoFocus
                />
                <span className={`material-icons absolute left-4 top-4 text-indigo-300 text-xl md:text-2xl mt-0.5 ${isMemberSearching ? 'animate-spin' : ''}`}>
                    {isMemberSearching ? 'sync' : 'search'}
                </span>

                {/* Dropdown */}
                {showMemberMenu && memberSearchResults.length > 0 && (
                  <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-2xl max-h-60 overflow-y-auto z-30">
                    {memberSearchResults.map((m, idx) => (
                      <div 
                        key={m.id}
                        onMouseDown={() => handleMemberSelect(m)}
                        className={`px-6 py-4 cursor-pointer flex justify-between items-center transition-colors border-b border-gray-50 last:border-0 ${
                          idx === highlightedMemberIdx ? 'bg-indigo-50 text-indigo-900' : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <div>
                          <p className="font-bold text-base md:text-lg">{m.companyName}</p>
                          <div className="flex gap-2 items-center">
                              <p className="text-xs md:text-sm text-gray-500">{m.name}</p>
                              {m.totalDebt > 0 && (
                                <span className="text-[10px] bg-red-100 text-red-600 px-1.5 rounded font-bold">Debt: {formatIDR(m.totalDebt)}</span>
                              )}
                          </div>
                        </div>
                        <span className="material-icons text-gray-300">chevron_right</span>
                      </div>
                    ))}
                  </div>
                )}
                {showMemberMenu && memberSearchResults.length === 0 && !isMemberSearching && debouncedMemberQuery && (
                    <div className="absolute left-0 right-0 top-full mt-2 bg-white border border-gray-100 rounded-xl shadow-lg p-4 text-center z-30">
                        <p className="text-gray-500">No members found.</p>
                    </div>
                )}
            </div>
        </div>
      </div>
    );
  }

  // MODE 2: POS Transaction View
  if (!selectedMember) return null; // Should not happen due to check above, but for types

  return (
    <div className="flex flex-col h-full animate-fade-in relative pb-20 md:pb-0">
        {feedback && (
          <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              <span className="material-icons text-lg">{feedback.type === 'success' ? 'check_circle' : 'error'}</span>
              <span className="font-medium text-sm">{feedback.msg}</span>
          </div>
        )}
        
        {/* Top Bar: Customer Info */}
        <div className="flex justify-between items-center bg-white p-3 md:p-4 rounded-xl shadow-sm border border-gray-200 mb-4 shrink-0">
            <div className="flex items-center gap-3 md:gap-4 overflow-hidden">
                <div className="w-10 h-10 md:w-12 md:h-12 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-base md:text-lg shrink-0">
                    {selectedMember.companyName.charAt(0)}
                </div>
                <div className="min-w-0">
                    <h2 className="text-base md:text-lg font-bold text-gray-800 truncate">{selectedMember.companyName}</h2>
                    <div className="flex gap-4 text-xs md:text-sm text-gray-500 truncate">
                        <span className="flex items-center gap-1"><span className="material-icons text-[10px] md:text-xs">person</span> {selectedMember.name}</span>
                        {selectedMember.totalDebt > 0 && (
                            <span className="flex items-center gap-1 text-red-600 font-bold bg-red-50 px-2 rounded">
                                <span className="material-icons text-[10px]">money_off</span> 
                                Debt: {formatIDR(selectedMember.totalDebt)}
                            </span>
                        )}
                        {/* Transaction Source Badge */}
                        <span className={`flex items-center gap-1 font-bold px-2 rounded ${transactionSource === 'TOKO' ? 'bg-indigo-50 text-indigo-600' : 'bg-cyan-50 text-cyan-600'}`}>
                           <span className="material-icons text-[10px] md:text-xs">{transactionSource === 'TOKO' ? 'store' : 'local_shipping'}</span>
                           {transactionSource}
                        </span>
                    </div>
                </div>
            </div>
            <button 
                onClick={() => {
                    setSelectedMemberId('');
                    setSelectedMemberObj(null);
                    setMemberQuery('');
                    setDebouncedMemberQuery('');
                    setCart([]);
                    setReturnsList([]);
                }}
                className="px-3 py-1.5 md:px-4 md:py-2 text-xs md:text-sm font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors whitespace-nowrap"
            >
                Change
            </button>
        </div>

        <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0">
            
            {/* LEFT COLUMN: Actions (Scan + Returns) */}
            <div className="flex-1 flex flex-col gap-4 min-h-0">
                
                {/* Scanner Section - Always Visible */}
                <div className="bg-white p-4 md:p-6 rounded-xl shadow-sm border border-gray-200 shrink-0 z-20">
                    <form onSubmit={handleScanSubmit} className="relative">
                        <div className="flex gap-2 md:gap-3">
                            <div className="relative flex-1">
                                <input
                                    ref={cylinderInputRef}
                                    type="text"
                                    value={scanInput}
                                    onChange={(e) => {
                                        setScanInput(e.target.value);
                                        setShowCylinderMenu(true);
                                    }}
                                    onFocus={() => setShowCylinderMenu(true)}
                                    onBlur={() => setTimeout(() => setShowCylinderMenu(false), 200)}
                                    onKeyDown={handleCylinderKeyDown}
                                    placeholder={isSearching ? "SEARCHING..." : "SCAN CODE..."}
                                    className="w-full border-2 border-gray-200 rounded-xl pl-10 md:pl-12 pr-4 py-2 md:py-3 text-base md:text-lg font-mono focus:border-indigo-500 focus:ring-4 focus:ring-indigo-500/10 outline-none transition-all uppercase"
                                    autoComplete="off"
                                    autoFocus
                                />
                                <span className={`material-icons absolute left-3 md:left-4 top-2.5 md:top-3.5 text-gray-400 text-lg md:text-xl ${isSearching ? 'animate-spin' : ''}`}>
                                    {isSearching ? 'sync' : 'qr_code_scanner'}
                                </span>
                            </div>
                            <button 
                                type="submit"
                                disabled={isSearching}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-400 text-white px-4 md:px-8 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95 text-sm md:text-base"
                            >
                                ADD
                            </button>
                        </div>

                        {/* Suggestions */}
                        {showCylinderMenu && serverSuggestions.length > 0 && (
                            <div className="absolute left-0 w-full mt-2 bg-white border border-gray-200 rounded-xl shadow-2xl z-20 overflow-hidden">
                                {serverSuggestions.map((cyl, idx) => (
                                    <div
                                        key={cyl.id}
                                        onMouseDown={() => addToCart(cyl)}
                                        className={`px-4 py-3 cursor-pointer border-b border-gray-50 flex items-center justify-between ${
                                            idx === highlightedCylinderIdx ? 'bg-indigo-50' : 'hover:bg-gray-50'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
                                                <span className="material-icons text-sm">propane</span>
                                            </div>
                                            <div>
                                                <p className="font-bold text-gray-800 font-mono">{cyl.serialCode}</p>
                                                <p className="text-xs text-gray-500">{cyl.gasType} • {cyl.size}</p>
                                            </div>
                                        </div>
                                        <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">Available</span>
                                    </div>
                                ))}
                            </div>
                        )}
                        {error && (
                            <div className="absolute -bottom-10 left-0 text-red-600 text-xs md:text-sm font-medium flex items-center gap-1 bg-red-50 px-3 py-1 rounded-lg">
                                <span className="material-icons text-sm">error</span> {error}
                            </div>
                        )}
                    </form>
                </div>

                {/* Mobile Tabs */}
                <div className="flex lg:hidden bg-white rounded-lg p-1 border border-gray-200 shrink-0">
                  <button 
                    onClick={() => setMobileTab('rent')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors flex items-center justify-center gap-2 ${mobileTab === 'rent' ? 'bg-indigo-100 text-indigo-700' : 'text-gray-500'}`}
                  >
                    <span>Rent ({cart.length})</span>
                  </button>
                  <button 
                    onClick={() => setMobileTab('return')}
                    className={`flex-1 py-2 text-sm font-bold rounded-md transition-colors flex items-center justify-center gap-2 ${mobileTab === 'return' ? 'bg-orange-100 text-orange-700' : 'text-gray-500'}`}
                  >
                    <span>Return ({returnsList.length})</span>
                  </button>
                </div>

                {/* Main Content Area (Scrollable) */}
                <div className="flex-1 overflow-y-auto min-h-0 space-y-4 pb-4">
                    
                    {/* SCANNED ITEMS LIST (Mobile: Show on Rent Tab, Desktop: Hidden here, shown in right col) */}
                    <div className={`${mobileTab === 'rent' ? 'block' : 'hidden'} lg:hidden space-y-2`}>
                        {cart.length === 0 ? (
                           <div className="text-center p-8 text-gray-400 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                              <span className="material-icons text-4xl mb-2">shopping_cart</span>
                              <p className="text-sm">No items scanned yet.</p>
                           </div>
                        ) : (
                           cart.map(item => {
                              const { price, isCustom } = getPrice(item, selectedMember.id);
                              return (
                                <div key={item.id} className="bg-white p-3 rounded-xl border border-gray-100 flex justify-between items-center shadow-sm">
                                    <div className="flex items-center gap-3">
                                        <button onClick={() => removeFromCart(item.id)} className="text-red-400 hover:text-red-600">
                                            <span className="material-icons text-lg">remove_circle</span>
                                        </button>
                                        <div>
                                            <p className="font-bold text-gray-800 font-mono text-sm">{item.serialCode}</p>
                                            <p className="text-xs text-gray-500">{item.gasType} • {item.size}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-bold text-indigo-600 text-sm">{formatIDR(price)}</p>
                                        {isCustom && <p className="text-[10px] text-green-600 font-medium">Promo</p>}
                                    </div>
                                </div>
                              );
                           })
                        )}
                    </div>

                    {/* RETURNS LIST (Mobile: Show on Return Tab, Desktop: Always visible if items exist) */}
                    <div className={`${mobileTab === 'return' ? 'block' : 'hidden'} lg:block`}>
                      {memberHeldCylinders.length > 0 ? (
                        <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col overflow-hidden">
                            <div className="p-3 md:p-4 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
                                <h3 className="font-bold text-gray-800 flex items-center gap-2 text-sm md:text-base">
                                    <span className="material-icons text-orange-500">assignment_return</span>
                                    Available for Return
                                </h3>
                                <span className="text-xs font-medium text-gray-500 bg-white px-2 py-1 rounded border border-gray-200">
                                    {memberHeldCylinders.length} held
                                </span>
                            </div>
                            <div className="p-2 grid grid-cols-1 md:grid-cols-2 gap-2">
                                {memberHeldCylinders.map(cyl => {
                                    const duration = getHeldDuration(cyl.id);
                                    const isSelected = returnsList.includes(cyl.id);
                                    return (
                                        <div 
                                            key={cyl.id}
                                            onClick={() => toggleReturn(cyl.id)}
                                            className={`cursor-pointer p-3 rounded-xl border transition-all relative overflow-hidden flex justify-between items-center ${
                                                isSelected 
                                                ? 'bg-orange-50 border-orange-400 shadow-sm' 
                                                : 'bg-white border-gray-100 hover:border-gray-300'
                                            }`}
                                        >
                                            <div>
                                                <div className="flex items-center gap-2 mb-1">
                                                    <span className={`font-bold font-mono text-sm ${isSelected ? 'text-orange-900' : 'text-gray-700'}`}>
                                                        {cyl.serialCode}
                                                    </span>
                                                    {isSelected && <span className="material-icons text-orange-500 text-base">check_circle</span>}
                                                </div>
                                                <div className="text-xs text-gray-500">{cyl.gasType} ({cyl.size})</div>
                                            </div>
                                            <div className={`text-[10px] inline-flex items-center gap-1 px-2 py-1 rounded font-medium ${
                                                duration.isLongTerm ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                                            }`}>
                                                <span className="material-icons text-[10px]">history</span>
                                                {duration.text}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                      ) : (
                          <div className="p-8 text-center text-gray-400 bg-gray-50 rounded-xl border-dashed border-2 border-gray-200">
                              <p className="text-sm">Customer has no items to return.</p>
                          </div>
                      )}
                    </div>
                </div>
            </div>

            {/* RIGHT COLUMN: Receipt / Summary (Hidden on Mobile) */}
            <div className="hidden lg:flex w-[400px] bg-white rounded-xl shadow-lg border border-gray-200 flex-col shrink-0 overflow-hidden h-full">
                <div className="p-5 border-b border-dashed border-gray-300 bg-gray-50">
                    <h2 className="text-lg font-bold text-gray-900 tracking-tight">Transaction Receipt</h2>
                    <p className="text-xs text-gray-500 mt-1">{new Date().toLocaleString()}</p>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-6">
                    {/* SECTION: RENTALS */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
                            Outgoing Rentals ({cart.length})
                        </h3>
                        {cart.length === 0 ? (
                            <p className="text-sm text-gray-400 italic pl-4">No items scanned.</p>
                        ) : (
                            <div className="space-y-2">
                                {cart.map(item => {
                                    const { price, isCustom } = getPrice(item, selectedMember.id);
                                    return (
                                        <div key={item.id} className="flex justify-between items-start group">
                                            <div className="flex items-start gap-3">
                                                <button onClick={() => removeFromCart(item.id)} className="text-gray-300 hover:text-red-500 mt-0.5">
                                                    <span className="material-icons text-sm">remove_circle</span>
                                                </button>
                                                <div>
                                                    <p className="font-bold text-gray-800 font-mono text-sm">{item.serialCode}</p>
                                                    <p className="text-xs text-gray-500">{item.gasType} • {item.size}</p>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <p className="font-semibold text-gray-800 text-sm">{formatIDR(price)}</p>
                                                {isCustom && <p className="text-[10px] text-green-600 font-medium">Special Rate</p>}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* SECTION: RETURNS */}
                    {returnsList.length > 0 && (
                        <div className="border-t border-dashed border-gray-200 pt-4">
                            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider mb-3 flex items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-orange-500"></span>
                                Incoming Returns ({returnsList.length})
                            </h3>
                            <div className="space-y-2">
                                {memberHeldCylinders.filter(c => returnsList.includes(c.id)).map(item => (
                                    <div key={item.id} className="flex justify-between items-center text-sm pl-4">
                                        <span className="font-mono text-gray-600">{item.serialCode}</span>
                                        <span className="text-xs font-bold text-orange-600 bg-orange-50 px-2 py-0.5 rounded">RETURN</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* DESKTOP TOTALS */}
                <div className="bg-gray-900 text-white p-6">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-gray-400 text-sm">Subtotal Items</span>
                        <span className="font-mono">{cart.length + returnsList.length}</span>
                    </div>
                    <div className="flex justify-between items-end mb-6">
                        <span className="text-lg font-bold">Total Due</span>
                        <span className="text-3xl font-bold text-green-400">{formatIDR(totalCost)}</span>
                    </div>
                    <button
                        onClick={handleCheckoutClick}
                        disabled={cart.length === 0 && returnsList.length === 0}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-xl font-bold text-lg shadow-lg transition-all flex justify-center items-center gap-2"
                    >
                        <span>Confirm & Pay</span>
                        <span className="material-icons text-sm">arrow_forward</span>
                    </button>
                </div>
            </div>

            {/* MOBILE FIXED BOTTOM BAR (Total + Pay) */}
            <div className="lg:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-40 pb-20 md:pb-4">
                <div className="flex items-center justify-between gap-4">
                    <div>
                        <p className="text-xs text-gray-500 font-bold uppercase">Total Due</p>
                        <p className="text-xl font-bold text-indigo-700">{formatIDR(totalCost)}</p>
                        <p className="text-xs text-gray-400">{cart.length} Rent • {returnsList.length} Return</p>
                    </div>
                    <button
                        onClick={handleCheckoutClick}
                        disabled={cart.length === 0 && returnsList.length === 0}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:text-gray-500 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-95"
                    >
                        Confirm
                    </button>
                </div>
            </div>
        </div>

        {/* CONFIRMATION MODAL */}
        {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in px-4">
             <div className="bg-white rounded-xl shadow-2xl w-full max-w-md mx-auto overflow-hidden animate-fade-in-up">
                {/* Modal Header */}
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2 text-lg">
                        <span className="material-icons">receipt_long</span>
                        Confirm Transaction
                    </h3>
                    <button onClick={() => setIsConfirmOpen(false)} className="text-indigo-200 hover:text-white transition-colors">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                
                {/* Modal Body */}
                <div className="p-6">
                    {/* Customer Info */}
                    <div className="mb-6 pb-4 border-b border-gray-100 text-center">
                        <p className="text-gray-400 text-xs uppercase tracking-widest font-bold mb-1">Customer</p>
                        <h4 className="text-xl font-bold text-gray-800">{selectedMember.companyName}</h4>
                        <p className="text-sm text-gray-500">{selectedMember.name}</p>
                    </div>

                    <div className="space-y-4 max-h-[40vh] overflow-y-auto mb-6">
                        {/* Rentals List */}
                        {cart.length > 0 && (
                            <div>
                                <h5 className="text-xs font-bold text-indigo-600 mb-2 flex items-center gap-1">
                                    <span className="material-icons text-sm">arrow_upward</span> Outgoing ({cart.length})
                                </h5>
                                <ul className="space-y-1">
                                    {cart.map(item => {
                                        const { price } = getPrice(item, selectedMember.id);
                                        return (
                                            <li key={item.id} className="flex justify-between text-sm">
                                                <span className="text-gray-600 font-mono">{item.serialCode}</span>
                                                <span className="font-medium">{formatIDR(price)}</span>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* Returns List */}
                        {returnsList.length > 0 && (
                             <div className={cart.length > 0 ? "pt-2 border-t border-dashed border-gray-200" : ""}>
                                <h5 className="text-xs font-bold text-orange-600 mb-2 flex items-center gap-1">
                                    <span className="material-icons text-sm">arrow_downward</span> Incoming ({returnsList.length})
                                </h5>
                                <ul className="space-y-1">
                                    {memberHeldCylinders.filter(c => returnsList.includes(c.id)).map(item => (
                                         <li key={item.id} className="flex justify-between text-sm">
                                            <span className="text-gray-600 font-mono">{item.serialCode}</span>
                                            <span className="text-xs bg-orange-100 text-orange-700 px-1.5 rounded">RETURN</span>
                                        </li>
                                    ))}
                                </ul>
                             </div>
                        )}
                    </div>

                    {/* Totals */}
                    <div className="bg-gray-50 rounded-lg p-4 border border-gray-100">
                        <div className="flex justify-between text-sm mb-1">
                            <span className="text-gray-500">Rental Subtotal</span>
                            <span className="font-semibold text-gray-700">{formatIDR(totalCost)}</span>
                        </div>
                         <div className="flex justify-between items-end border-t border-gray-200 pt-2 mt-2">
                            <span className="font-bold text-gray-800">Net Total Due</span>
                            <span className="text-2xl font-bold text-indigo-600">{formatIDR(totalCost)}</span>
                        </div>
                    </div>
                </div>

                {/* Modal Actions */}
                <div className="p-4 bg-gray-50 border-t border-gray-100 flex flex-col gap-3">
                    <button 
                        onClick={() => confirmTransaction(false)}
                        className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-lg shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
                    >
                        <span>Pay Now</span>
                        <span className="material-icons text-sm">payments</span>
                    </button>
                    {totalCost > 0 && (
                        <button 
                            onClick={() => confirmTransaction(true)}
                            className="w-full py-3 bg-white border-2 border-orange-500 text-orange-600 hover:bg-orange-50 rounded-lg font-bold transition-colors flex items-center justify-center gap-2"
                        >
                            <span>Pay Later (Debt)</span>
                            <span className="material-icons text-sm">money_off</span>
                        </button>
                    )}
                </div>
             </div>
          </div>
        )}
    </div>
  );
};

export default RentalForm;
