import React, { useState, useMemo } from 'react';
import { Cylinder, CylinderStatus, RefillStation, GasType, RefillPrice, CylinderSize } from '../types';

interface RefillViewProps {
  cylinders: Cylinder[];
  stations: RefillStation[];
  refillPrices: RefillPrice[];
  onUpdateRefillPrices: (prices: RefillPrice[]) => void;
  onSendToRefill: (stationId: string, cylinderIds: string[]) => void;
  onReceiveFromRefill: (cylinderIds: string[], totalCost: number) => void;
  onAddStation: (station: RefillStation) => void;
  onUpdateStation: (station: RefillStation) => void;
  onDeleteStation: (id: string) => void;
}

const RefillView: React.FC<RefillViewProps> = ({
  cylinders,
  stations,
  refillPrices,
  onUpdateRefillPrices,
  onSendToRefill,
  onReceiveFromRefill,
  onAddStation,
  onUpdateStation,
  onDeleteStation
}) => {
  const [activeTab, setActiveTab] = useState<'dispatch' | 'restock' | 'stations'>('dispatch');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedStationId, setSelectedStationId] = useState<string>('');
  const [restockCost, setRestockCost] = useState<string>('');
  
  const [feedback, setFeedback] = useState<{msg: string, type: 'success' | 'error'} | null>(null);

  const [isStationModalOpen, setIsStationModalOpen] = useState(false);
  const [currentStation, setCurrentStation] = useState<Partial<RefillStation>>({});
  const [stationToDelete, setStationToDelete] = useState<RefillStation | null>(null);

  const [isDispatchConfirmOpen, setIsDispatchConfirmOpen] = useState(false);
  const [isRestockConfirmOpen, setIsRestockConfirmOpen] = useState(false);
  
  const [editingPrices, setEditingPrices] = useState<RefillPrice[]>([]);

  // -- Derived Data --
  const emptyCylinders = useMemo(() => cylinders.filter(c => c.status === CylinderStatus.EmptyRefill), [cylinders]);
  const refillingCylinders = useMemo(() => cylinders.filter(c => c.status === CylinderStatus.Refilling), [cylinders]);

  // -- Dispatch Logic --
  // 1. Get prices for selected vendor
  const vendorPrices = useMemo(() => 
    refillPrices.filter(p => p.stationId === selectedStationId),
  [refillPrices, selectedStationId]);

  // 2. Filter cylinders that this vendor can actually accept (based on defined prices)
  const vendorCompatibleCylinders = useMemo(() => {
    if (!selectedStationId) return [];
    
    return emptyCylinders.filter(c => {
        // Find ALL matching price configs for this gas/size (vendor might have multiple SKUs for same gas)
        const matchingConfigs = vendorPrices.filter(p => p.gasType === c.gasType && p.size === c.size);
        if (matchingConfigs.length === 0) return false; // Vendor doesn't trade this gas/size at all

        // Check if ANY of the matching prices allow this cylinder
        // A match occurs if:
        // A) The price config has NO serialCode (accepts any SKU for this gas/size)
        // B) The cylinder's serial prefix CONTAINS the vendor's serialCode
        return matchingConfigs.some(config => {
            if (!config.serialCode) return true;
            
            const cylinderPrefix = c.serialCode.split('-')[0];
            return cylinderPrefix.includes(config.serialCode);
        });
    });
  }, [emptyCylinders, vendorPrices, selectedStationId]);

  const showFeedback = (msg: string, type: 'success' | 'error' = 'success') => {
      setFeedback({ msg, type });
      setTimeout(() => setFeedback(null), 3000);
  };
  
  const formatIDR = (val: number) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', minimumFractionDigits: 0 }).format(val);

  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectAll = (list: Cylinder[]) => {
      if (selectedIds.length === list.length) {
          setSelectedIds([]);
      } else {
          setSelectedIds(list.map(c => c.id));
      }
  };

  const getDispatchSummary = () => {
    if (!selectedStationId || selectedIds.length === 0) return [];
    
    const summaryMap: Record<string, { count: number, price: number, gas: string, size: string, hasPrice: boolean }> = {};
    
    selectedIds.forEach(id => {
        const cyl = cylinders.find(c => c.id === id);
        if (!cyl) return;
        
        // Find the specific price that matched this cylinder
        const cylinderSku = cyl.serialCode.split('-')[0];
        const priceEntry = vendorPrices.find(p => 
            p.gasType === cyl.gasType && 
            p.size === cyl.size &&
            (!p.serialCode || cylinderSku.includes(p.serialCode!))
        );

        const key = `${cyl.gasType}-${cyl.size}-${priceEntry?.serialCode || 'GENERIC'}`;
        
        if (!summaryMap[key]) {
            summaryMap[key] = {
                count: 0,
                price: priceEntry ? priceEntry.price : 0,
                hasPrice: !!priceEntry,
                gas: cyl.gasType,
                size: cyl.size
            };
        }
        summaryMap[key].count++;
    });
    return Object.values(summaryMap);
  };

  const getRestockSummary = () => {
    const summaryMap: Record<string, { count: number, gas: string, size: string }> = {};
    selectedIds.forEach(id => {
        const cyl = cylinders.find(c => c.id === id);
        if (!cyl) return;
        const key = `${cyl.gasType}-${cyl.size}`;
        if (!summaryMap[key]) {
            summaryMap[key] = { count: 0, gas: cyl.gasType, size: cyl.size };
        }
        summaryMap[key].count++;
    });
    return Object.values(summaryMap);
  };

  const dispatchSummary = getDispatchSummary();
  const estimatedCost = dispatchSummary.reduce((sum, item) => sum + (item.count * item.price), 0);

  const handleDispatchClick = () => {
    if (!selectedStationId || selectedIds.length === 0) return;
    setIsDispatchConfirmOpen(true);
  };

  const confirmDispatch = () => {
    onSendToRefill(selectedStationId, selectedIds);
    setSelectedIds([]);
    setIsDispatchConfirmOpen(false);
    showFeedback("Dispatch successful. Cylinders sent to station.");
  };

  const handleRestockClick = () => {
    if (selectedIds.length === 0) return;
    setIsRestockConfirmOpen(true);
  };

  const confirmRestock = () => {
    const cost = parseFloat(restockCost) || 0;
    onReceiveFromRefill(selectedIds, cost);
    setSelectedIds([]);
    setRestockCost('');
    setIsRestockConfirmOpen(false);
    showFeedback("Restock successful. Inventory updated.");
  };

  // Station Modal
  const handleOpenStationModal = (station?: RefillStation) => {
      if (station) {
          setCurrentStation(station);
          const stationPrices = refillPrices.filter(p => p.stationId === station.id);
          setEditingPrices(JSON.parse(JSON.stringify(stationPrices)));
      } else {
          setCurrentStation({});
          setEditingPrices([]);
      }
      setIsStationModalOpen(true);
  };

  const handleSaveStation = (e: React.FormEvent) => {
      e.preventDefault();
      if (!currentStation.name) return;
      let stationId = currentStation.id;

      if (stationId) {
          onUpdateStation(currentStation as RefillStation);
          showFeedback("Station updated.");
      } else {
          stationId = `rs-${Date.now()}`;
          onAddStation({
              id: stationId,
              name: currentStation.name,
              address: currentStation.address || '',
              contactPerson: currentStation.contactPerson || '',
              phone: currentStation.phone || ''
          });
          showFeedback("New Station added.");
      }

      const otherPrices = refillPrices.filter(p => p.stationId !== stationId);
      const newStationPrices = editingPrices.map(p => ({...p, stationId: stationId!}));
      onUpdateRefillPrices([...otherPrices, ...newStationPrices]);
      setIsStationModalOpen(false);
  };

  const confirmDeleteStation = () => {
      if (!stationToDelete) return;
      onDeleteStation(stationToDelete.id);
      setStationToDelete(null);
      showFeedback("Station deleted.", "success");
  };

  // Pricing Logic
  const addPriceRow = () => {
      setEditingPrices([
          ...editingPrices, 
          { id: `rp-temp-${Date.now()}`, stationId: currentStation.id || '', gasType: GasType.Oxygen, size: CylinderSize.Large, price: 0, serialCode: '' }
      ]);
  };

  const removePriceRow = (idx: number) => {
      const newPrices = [...editingPrices];
      newPrices.splice(idx, 1);
      setEditingPrices(newPrices);
  };

  const updatePriceRow = (idx: number, field: keyof RefillPrice, value: any) => {
      const newPrices = [...editingPrices];
      newPrices[idx] = { ...newPrices[idx], [field]: value };
      setEditingPrices(newPrices);
  };

  // -- RENDER HELPERS --

  // Mobile Card Item
  const renderCylinderCard = (c: Cylinder, isSelected: boolean, vendorSku?: string, price?: number) => (
      <div 
        key={c.id} 
        onClick={() => toggleSelection(c.id)}
        className={`p-4 rounded-xl border mb-3 flex items-center justify-between transition-all active:scale-[0.98] ${
            isSelected 
            ? 'bg-indigo-50 border-indigo-500 shadow-sm' 
            : 'bg-white border-gray-200 shadow-sm'
        }`}
      >
        <div className="flex items-center gap-3">
             <div className={`w-10 h-10 rounded-full flex items-center justify-center text-lg ${isSelected ? 'bg-indigo-200 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
                 <span className="material-icons">{isSelected ? 'check' : 'propane'}</span>
             </div>
             <div>
                <div className="flex items-center gap-2">
                    <span className="font-bold font-mono text-gray-900">{c.serialCode}</span>
                    {vendorSku && <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 rounded border border-indigo-200 font-mono">SKU: {vendorSku}</span>}
                </div>
                <div className="text-xs text-gray-500 flex gap-2 mt-0.5">
                    <span className="bg-gray-100 px-1.5 py-0.5 rounded text-gray-600">{c.gasType}</span>
                    <span className="border border-gray-200 px-1.5 py-0.5 rounded text-gray-500">{c.size}</span>
                </div>
             </div>
        </div>
        <div className="text-right">
             {price !== undefined && (
                <p className="font-bold text-gray-800 text-sm">{formatIDR(price)}</p>
             )}
             <div className="text-xs text-gray-400 flex items-center gap-1 justify-end">
                <span className="material-icons text-[10px]">place</span> 
                <span className="truncate max-w-[80px]">{c.lastLocation}</span>
             </div>
        </div>
      </div>
  );

  return (
    <div className="space-y-6 relative animate-fade-in-up pb-32 lg:pb-0">
      {feedback && (
          <div className={`fixed top-4 left-1/2 transform -translate-x-1/2 px-6 py-3 rounded-lg shadow-lg z-50 flex items-center gap-2 ${feedback.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
              <span className="material-icons text-lg">{feedback.type === 'success' ? 'check_circle' : 'error'}</span>
              <span className="font-medium text-sm">{feedback.msg}</span>
          </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
         <div>
            <h2 className="text-2xl font-bold text-gray-800">Refill Management</h2>
            <p className="text-gray-500 text-sm">Track refills, manage vendors, and control costs.</p>
         </div>
      </div>

      {/* Mobile-Friendly Tabs */}
      <div className="border-b border-gray-200 flex gap-4 overflow-x-auto hide-scrollbar">
          {[
             { id: 'dispatch', label: 'Dispatch', icon: 'local_shipping' },
             { id: 'restock', label: 'Restock', icon: 'inventory_2' },
             { id: 'stations', label: 'Vendors', icon: 'store' }
          ].map(tab => (
              <button 
                key={tab.id}
                onClick={() => { setActiveTab(tab.id as any); setSelectedIds([]); }}
                className={`pb-4 px-2 text-sm font-medium transition-all relative flex items-center gap-2 whitespace-nowrap ${
                    activeTab === tab.id 
                    ? 'text-indigo-600' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                  <span className="material-icons text-lg">{tab.icon}</span>
                  {tab.label}
                  {activeTab === tab.id && (
                      <span className="absolute bottom-0 left-0 w-full h-0.5 bg-indigo-600 rounded-t-full"></span>
                  )}
              </button>
          ))}
      </div>

      {/* TAB: DISPATCH */}
      {activeTab === 'dispatch' && (
          <div className="flex flex-col gap-6 animate-fade-in">
              {/* STEP 1: Vendor Selection */}
              <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm">
                  <div className="flex flex-col md:flex-row gap-6 items-start md:items-center justify-between">
                     <div className="w-full md:w-1/2">
                        <label className="block text-xs font-bold text-gray-500 uppercase mb-2">1. Select Vendor</label>
                        <div className="relative">
                            <span className="material-icons absolute left-3 top-3 text-gray-400">store</span>
                            <select 
                                value={selectedStationId}
                                onChange={(e) => { setSelectedStationId(e.target.value); setSelectedIds([]); }}
                                className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white appearance-none"
                            >
                                <option value="">-- Choose Refill Station --</option>
                                {stations.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                            </select>
                            <span className="material-icons absolute right-3 top-3 text-gray-400 pointer-events-none">expand_more</span>
                        </div>
                     </div>
                     
                     {selectedStationId && (
                         <div className="w-full md:w-auto flex items-center gap-4 bg-gray-50 px-4 py-3 rounded-lg border border-gray-100">
                             <div>
                                 <p className="text-xs text-gray-500 uppercase">Compatible Empty</p>
                                 <p className="text-xl font-bold text-gray-800">{vendorCompatibleCylinders.length}</p>
                             </div>
                             <div className="h-8 w-px bg-gray-300"></div>
                             <div>
                                 <p className="text-xs text-gray-500 uppercase">Total Empty</p>
                                 <p className="text-xl font-bold text-gray-400">{emptyCylinders.length}</p>
                             </div>
                         </div>
                     )}
                  </div>
              </div>

              {/* STEP 2: Cylinder List */}
              {selectedStationId ? (
                <div className="flex flex-col lg:flex-row gap-6">
                    <div className="flex-1 bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden flex flex-col min-h-[500px]">
                        {/* List Header */}
                        <div className="p-4 bg-gray-50 border-b border-gray-100 flex items-center justify-between sticky top-0 z-10">
                            <div>
                                <h3 className="font-bold text-gray-800 text-sm">2. Select Cylinders to Refill</h3>
                                <p className="text-xs text-gray-500">Only showing items compatible with {stations.find(s => s.id === selectedStationId)?.name}</p>
                            </div>
                            <button 
                                onClick={() => handleSelectAll(vendorCompatibleCylinders)} 
                                className="text-sm text-indigo-600 font-medium hover:underline bg-white px-3 py-1 rounded border border-gray-200"
                            >
                                {selectedIds.length === vendorCompatibleCylinders.length && vendorCompatibleCylinders.length > 0 ? 'Deselect All' : 'Select All'}
                            </button>
                        </div>

                        {/* Filtered List */}
                        <div className="flex-1 overflow-y-auto max-h-[600px]">
                            {vendorCompatibleCylinders.length > 0 ? (
                                <>
                                    {/* Desktop Table */}
                                    <div className="hidden lg:block">
                                        <table className="w-full text-left text-sm">
                                            <thead className="bg-white border-b border-gray-100 sticky top-0">
                                                <tr className="text-gray-500 uppercase text-xs tracking-wider">
                                                    <th className="px-6 py-3 w-10"></th>
                                                    <th className="px-6 py-3">Serial Code</th>
                                                    <th className="px-6 py-3">Vendor SKU</th>
                                                    <th className="px-6 py-3">Type / Size</th>
                                                    <th className="px-6 py-3 text-right">Unit Cost</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {vendorCompatibleCylinders.map(c => {
                                                    const cylinderSku = c.serialCode.split('-')[0];
                                                    // Find best matching price config for this specific cylinder at this vendor
                                                    // We look for a config that matches the gas/size AND (matches the SKU OR has no SKU)
                                                    const priceConfig = vendorPrices.find(p => 
                                                        p.gasType === c.gasType && 
                                                        p.size === c.size &&
                                                        (!p.serialCode || cylinderSku.includes(p.serialCode))
                                                    );

                                                    return (
                                                        <tr 
                                                            key={c.id} 
                                                            className={`group cursor-pointer transition-colors ${selectedIds.includes(c.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`} 
                                                            onClick={() => toggleSelection(c.id)}
                                                        >
                                                            <td className="px-6 py-4">
                                                                <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(c.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                                                    {selectedIds.includes(c.id) && <span className="material-icons text-white text-sm">check</span>}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 font-mono font-medium text-gray-900 group-hover:text-indigo-600 transition-colors">{c.serialCode}</td>
                                                            <td className="px-6 py-4">
                                                                <span className="font-mono text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded border border-gray-200">
                                                                    {/* Display the matching SKU if available, otherwise the cylinder's own SKU prefix */}
                                                                    {priceConfig?.serialCode || cylinderSku}
                                                                </span>
                                                            </td>
                                                            <td className="px-6 py-4 text-gray-600">
                                                                <span className="px-2 py-1 rounded bg-gray-100 text-xs font-medium">{c.gasType}</span>
                                                                <span className="ml-2 text-xs text-gray-400">{c.size}</span>
                                                            </td>
                                                            <td className="px-6 py-4 text-right font-medium text-gray-700">
                                                                {priceConfig ? formatIDR(priceConfig.price) : '-'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>

                                    {/* Mobile Card List */}
                                    <div className="lg:hidden p-4 bg-gray-50 space-y-3">
                                        {vendorCompatibleCylinders.map(c => {
                                             const cylinderSku = c.serialCode.split('-')[0];
                                             const priceConfig = vendorPrices.find(p => 
                                                p.gasType === c.gasType && 
                                                p.size === c.size &&
                                                (!p.serialCode || cylinderSku.includes(p.serialCode))
                                             );
                                             return renderCylinderCard(c, selectedIds.includes(c.id), priceConfig?.serialCode || cylinderSku, priceConfig?.price);
                                        })}
                                    </div>
                                </>
                            ) : (
                                <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                                    <span className="material-icons text-4xl mb-2 text-gray-300">block</span>
                                    <p>No compatible empty cylinders found for this vendor.</p>
                                    <p className="text-xs mt-1">Check vendor pricing and SKU matching.</p>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Summary / Action Panel */}
                    <div className="w-full lg:w-80 bg-white rounded-xl shadow-lg border border-gray-200 p-6 flex flex-col h-fit sticky top-6">
                        <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                            <span className="material-icons text-indigo-600 text-sm">summarize</span>
                            Dispatch Summary
                        </h3>
                        
                        <div className="space-y-4 mb-6">
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Destination</span>
                                <span className="font-medium text-gray-800 text-right">{stations.find(s => s.id === selectedStationId)?.name}</span>
                            </div>
                            <div className="flex justify-between text-sm">
                                <span className="text-gray-500">Items Selected</span>
                                <span className="font-bold text-gray-800">{selectedIds.length}</span>
                            </div>
                            <div className="border-t border-gray-100 pt-3 flex justify-between items-end">
                                <span className="text-gray-500 text-sm">Estimated Cost</span>
                                <span className="font-bold text-xl text-indigo-600">{formatIDR(estimatedCost)}</span>
                            </div>
                        </div>

                        <button 
                            onClick={handleDispatchClick}
                            disabled={selectedIds.length === 0}
                            className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all flex justify-center items-center gap-2 shadow-lg shadow-indigo-200"
                        >
                            <span>Dispatch Now</span>
                            <span className="material-icons text-sm">arrow_forward</span>
                        </button>
                    </div>
                </div>
              ) : (
                // Empty State when no vendor selected
                <div className="flex flex-col items-center justify-center h-64 bg-gray-50 border-2 border-dashed border-gray-200 rounded-xl text-gray-400">
                    <span className="material-icons text-4xl mb-2">store</span>
                    <p>Please select a vendor above to start dispatch.</p>
                </div>
              )}
          </div>
      )}

      {/* TAB: RESTOCK (Kept similar but adapted structure if needed, focusing on dispatch revamp mainly) */}
      {activeTab === 'restock' && (
          // ... (Rest of component unchanged)
          <div className="flex flex-col lg:flex-row gap-6 animate-fade-in">
             <div className="flex-1 bg-white lg:bg-transparent rounded-xl lg:rounded-none lg:border-none shadow-sm lg:shadow-none border border-gray-200 lg:border-0 overflow-hidden flex flex-col">
                  {/* Summary Bar */}
                  <div className="p-4 bg-gray-50 lg:bg-gray-50 lg:border lg:border-gray-100 lg:rounded-t-xl border-b border-gray-100 flex items-center justify-between gap-6 sticky top-0 z-10 lg:static">
                      <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-yellow-400"></span>
                            <span className="text-gray-600">Refilling: <strong>{refillingCylinders.length}</strong></span>
                          </div>
                          <div className="hidden md:flex items-center gap-2">
                             <span className="w-2 h-2 rounded-full bg-indigo-600"></span>
                             <span className="text-gray-600">Selected: <strong>{selectedIds.length}</strong></span>
                          </div>
                      </div>
                      <button onClick={() => handleSelectAll(refillingCylinders)} className="text-sm text-indigo-600 font-medium hover:underline">
                          {selectedIds.length === refillingCylinders.length && refillingCylinders.length > 0 ? 'Deselect All' : 'Select All'}
                      </button>
                  </div>

                  <div className="flex-1 lg:bg-white lg:border lg:border-gray-200 lg:rounded-b-xl lg:overflow-hidden">
                      {refillingCylinders.length > 0 ? (
                        <>
                            {/* Desktop Table */}
                            <div className="hidden lg:block overflow-y-auto max-h-[600px]">
                                <table className="w-full text-left text-sm">
                                <thead className="bg-white sticky top-0 shadow-sm z-10">
                                    <tr className="text-gray-500 uppercase text-xs tracking-wider">
                                        <th className="px-6 py-3 w-10"></th>
                                        <th className="px-6 py-3">Serial Code</th>
                                        <th className="px-6 py-3">Type / Size</th>
                                        <th className="px-6 py-3">Current Location</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {refillingCylinders.map(c => (
                                        <tr key={c.id} className={`group cursor-pointer transition-colors ${selectedIds.includes(c.id) ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`} onClick={() => toggleSelection(c.id)}>
                                            <td className="px-6 py-4">
                                                    <div className={`w-5 h-5 rounded border flex items-center justify-center transition-colors ${selectedIds.includes(c.id) ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300 bg-white'}`}>
                                                    {selectedIds.includes(c.id) && <span className="material-icons text-white text-sm">check</span>}
                                                    </div>
                                            </td>
                                            <td className="px-6 py-4 font-mono font-medium text-gray-900">{c.serialCode}</td>
                                            <td className="px-6 py-4 text-gray-600">
                                                    <span className="px-2 py-1 rounded bg-gray-100 text-xs font-medium">{c.gasType}</span>
                                                    <span className="ml-2 text-xs text-gray-400">{c.size}</span>
                                            </td>
                                            <td className="px-6 py-4 text-gray-500 text-xs flex items-center gap-1">
                                                <span className="material-icons text-[10px] text-gray-400">store</span>
                                                {c.lastLocation}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                                </table>
                            </div>
                             {/* Mobile Card List */}
                             <div className="lg:hidden p-4 bg-gray-50 min-h-[300px]">
                                {refillingCylinders.map(c => renderCylinderCard(c, selectedIds.includes(c.id), undefined, undefined))}
                            </div>
                        </>
                      ) : (
                          <div className="flex flex-col items-center justify-center h-64 text-gray-400 bg-white lg:bg-transparent">
                              <span className="material-icons text-4xl mb-2 text-gray-300">hourglass_empty</span>
                              <p>No cylinders currently out for refill.</p>
                          </div>
                      )}
                  </div>
              </div>

              {/* Desktop Sidebar */}
              <div className="hidden lg:block w-80 space-y-4">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 sticky top-6">
                      <h3 className="font-bold text-gray-800 mb-4 flex items-center gap-2">
                        <span className="material-icons text-green-600 text-sm">input</span>
                        Restock Action
                      </h3>
                      <div className="space-y-4">
                          <div>
                              <label className="block text-xs font-bold text-gray-500 uppercase mb-1">Total Batch Cost (IDR)</label>
                              <input 
                                  type="number"
                                  value={restockCost}
                                  onChange={(e) => setRestockCost(e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none"
                                  placeholder="e.g. 1500000"
                                  min="0"
                              />
                          </div>
                          
                          <div className="bg-green-50 rounded-lg p-4 border border-green-100">
                                <div className="flex justify-between text-sm">
                                    <span className="text-green-800">Receiving</span>
                                    <span className="font-bold text-green-900">{selectedIds.length} items</span>
                                </div>
                          </div>

                          <button 
                              onClick={handleRestockClick}
                              disabled={selectedIds.length === 0}
                              className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg font-bold transition-all flex justify-center items-center gap-2 shadow-sm"
                          >
                              <span className="material-icons text-sm">check_circle</span>
                              Confirm Restock
                          </button>
                      </div>
                  </div>
              </div>

              {/* Mobile Sticky Action Bar */}
              <div className="lg:hidden fixed bottom-[58px] left-0 right-0 bg-white border-t border-gray-200 p-4 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.1)] z-30">
                 <div className="flex flex-col gap-3">
                     <div className="flex gap-2">
                         <div className="flex-1 relative">
                             <span className="absolute left-3 top-2.5 text-gray-400 text-xs">Rp</span>
                             <input 
                                  type="number"
                                  value={restockCost}
                                  onChange={(e) => setRestockCost(e.target.value)}
                                  className="w-full border border-gray-300 rounded-lg pl-8 pr-3 py-2 text-sm focus:ring-2 focus:ring-green-500 outline-none bg-white"
                                  placeholder="Total Cost"
                                  min="0"
                              />
                         </div>
                        <div className="flex items-center justify-center px-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-bold text-green-600 min-w-[3rem]">
                           {selectedIds.length}
                        </div>
                     </div>
                     <button 
                        onClick={handleRestockClick}
                        disabled={selectedIds.length === 0}
                        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 text-white rounded-xl font-bold transition-all shadow-md active:scale-95 flex items-center justify-center gap-2"
                    >
                        <span>Confirm Receipt</span>
                        <span className="material-icons text-sm">check</span>
                    </button>
                 </div>
              </div>
          </div>
      )}

      {/* TAB: STATIONS */}
      {activeTab === 'stations' && (
          // ... (Rest of component unchanged)
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden animate-fade-in relative">
             
             {/* Mobile Header Action */}
             <div className="lg:hidden absolute top-3 right-3 z-10">
                <button 
                    onClick={() => handleOpenStationModal()}
                    className="w-10 h-10 bg-indigo-600 text-white rounded-full flex items-center justify-center shadow-lg active:scale-95"
                >
                    <span className="material-icons text-xl">add</span>
                </button>
             </div>

             <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50">
                <h3 className="font-bold text-gray-800 flex items-center gap-2">
                    <span className="material-icons text-gray-400">list</span>
                    Vendors List
                </h3>
                <button 
                    onClick={() => handleOpenStationModal()}
                    className="hidden lg:flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors shadow-sm"
                >
                    <span className="material-icons text-sm">add</span>
                    Add Vendor
                </button>
             </div>

             {/* Desktop Table */}
             <div className="hidden lg:block">
                 <table className="w-full text-left text-sm">
                    <thead className="bg-white border-b border-gray-100">
                        <tr className="text-gray-500 uppercase text-xs tracking-wider">
                            <th className="px-6 py-3">Vendor Name</th>
                            <th className="px-6 py-3">Contact</th>
                            <th className="px-6 py-3">Address</th>
                            <th className="px-6 py-3 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {stations.map(s => (
                            <tr key={s.id} className="hover:bg-gray-50 group">
                                <td className="px-6 py-4 font-semibold text-gray-900">{s.name}</td>
                                <td className="px-6 py-4 text-gray-600">
                                    <div className="flex flex-col">
                                        <span>{s.contactPerson}</span>
                                        <span className="text-xs text-gray-400">{s.phone}</span>
                                    </div>
                                </td>
                                <td className="px-6 py-4 text-gray-500 truncate max-w-xs">{s.address}</td>
                                <td className="px-6 py-4 text-right">
                                    <div className="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                                        <button onClick={() => handleOpenStationModal(s)} className="p-1 hover:bg-indigo-50 text-gray-400 hover:text-indigo-600 rounded">
                                            <span className="material-icons text-sm">edit</span>
                                        </button>
                                        <button onClick={() => setStationToDelete(s)} className="p-1 hover:bg-red-50 text-gray-400 hover:text-red-500 rounded">
                                            <span className="material-icons text-sm">delete</span>
                                        </button>
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                 </table>
             </div>

             {/* Mobile Card List */}
             <div className="lg:hidden p-4 space-y-3 bg-gray-50 min-h-[400px]">
                {stations.map(s => (
                    <div key={s.id} className="bg-white p-4 rounded-xl border border-gray-200 shadow-sm relative">
                        <div className="flex justify-between items-start mb-2">
                             <div>
                                <h4 className="font-bold text-gray-800 text-lg">{s.name}</h4>
                                <p className="text-xs text-gray-500">{s.address}</p>
                             </div>
                             <div className="flex gap-1">
                                <button onClick={() => handleOpenStationModal(s)} className="p-2 text-gray-400 hover:text-indigo-600 bg-gray-50 rounded-lg">
                                    <span className="material-icons text-lg">edit</span>
                                </button>
                                <button onClick={() => setStationToDelete(s)} className="p-2 text-gray-400 hover:text-red-500 bg-gray-50 rounded-lg">
                                    <span className="material-icons text-lg">delete</span>
                                </button>
                             </div>
                        </div>
                        <div className="flex items-center gap-3 mt-3 pt-3 border-t border-gray-100">
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="material-icons text-gray-400 text-sm">person</span>
                                {s.contactPerson}
                            </div>
                            <div className="h-4 w-px bg-gray-200"></div>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                                <span className="material-icons text-gray-400 text-sm">phone</span>
                                {s.phone}
                            </div>
                        </div>
                    </div>
                ))}
             </div>
          </div>
      )}

      {/* DISPATCH CONFIRMATION MODAL */}
      {isDispatchConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden transform scale-100 transition-all">
                <div className="bg-indigo-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">local_shipping</span>
                        Confirm Dispatch
                    </h3>
                    <button onClick={() => setIsDispatchConfirmOpen(false)} className="text-indigo-200 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <div className="mb-4 bg-gray-50 p-4 rounded-xl border border-gray-100 flex items-start gap-3">
                        <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg shrink-0">
                            <span className="material-icons">store</span>
                        </div>
                        <div>
                            <p className="text-xs text-gray-500 uppercase font-bold mb-0.5">Destination</p>
                            <p className="font-bold text-gray-800 text-lg">{stations.find(s => s.id === selectedStationId)?.name}</p>
                            <p className="text-sm text-gray-600">{stations.find(s => s.id === selectedStationId)?.address}</p>
                        </div>
                    </div>

                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Manifest</h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden mb-4 max-h-[200px] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-2 font-normal">Item Description</th>
                                    <th className="px-4 py-2 font-normal text-center">Qty</th>
                                    <th className="px-4 py-2 font-normal text-right">Subtotal</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {dispatchSummary.map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <div className="font-medium text-gray-800">{item.gas}</div>
                                            <div className="text-xs text-gray-500">{item.size}</div>
                                        </td>
                                        <td className="px-4 py-2 text-center">{item.count}</td>
                                        <td className="px-4 py-2 text-right font-medium">
                                            {formatIDR(item.count * item.price)}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot className="bg-gray-50 font-bold text-gray-800 border-t border-gray-200 sticky bottom-0">
                                <tr>
                                    <td colSpan={2} className="px-4 py-3 text-right text-gray-500 font-normal">Total Estimated</td>
                                    <td className="px-4 py-3 text-right text-indigo-700">{formatIDR(estimatedCost)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="flex justify-end gap-3 pt-2">
                        <button 
                            onClick={() => setIsDispatchConfirmOpen(false)}
                            className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDispatch}
                            className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-indigo-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <span>Dispatch</span>
                            <span className="material-icons text-sm">arrow_forward</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* RESTOCK CONFIRMATION MODAL */}
      {isRestockConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
                <div className="bg-green-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">inventory</span>
                        Confirm Restock
                    </h3>
                    <button onClick={() => setIsRestockConfirmOpen(false)} className="text-green-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 mb-6 text-center">
                         <p className="text-gray-500 text-sm mb-1">Total Cost Incurred</p>
                         <p className="text-3xl font-bold text-gray-800 tracking-tight">{formatIDR(parseFloat(restockCost) || 0)}</p>
                         {selectedIds.length > 0 && parseFloat(restockCost) > 0 && (
                            <p className="text-xs text-gray-400 mt-1">Avg: {formatIDR((parseFloat(restockCost) || 0) / selectedIds.length)} / cyl</p>
                         )}
                    </div>

                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">Items Received</h4>
                    <div className="border border-gray-200 rounded-lg overflow-hidden mb-6 max-h-[200px] overflow-y-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500 font-medium border-b border-gray-200">
                                <tr>
                                    <th className="px-4 py-2 font-normal">Item</th>
                                    <th className="px-4 py-2 font-normal text-right">Count</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {getRestockSummary().map((item, idx) => (
                                    <tr key={idx}>
                                        <td className="px-4 py-2">
                                            <div className="font-medium text-gray-800">{item.gas}</div>
                                            <div className="text-xs text-gray-500">{item.size}</div>
                                        </td>
                                        <td className="px-4 py-2 text-right font-medium">{item.count}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setIsRestockConfirmOpen(false)}
                            className="flex-1 py-3 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmRestock}
                            className="flex-1 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-bold shadow-lg shadow-green-200 transition-colors flex items-center justify-center gap-2"
                        >
                            <span className="material-icons text-sm">check</span>
                            Confirm
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* STATION DELETE MODAL */}
      {stationToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden">
                <div className="bg-red-600 px-6 py-4 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">warning</span>
                        Delete Station
                    </h3>
                    <button onClick={() => setStationToDelete(null)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6 text-center">
                    <div className="w-12 h-12 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-icons">delete_forever</span>
                    </div>
                    <p className="text-gray-800 font-bold text-lg mb-2">Delete {stationToDelete.name}?</p>
                    <p className="text-gray-500 text-sm mb-6">
                        This action cannot be undone. All associated pricing configurations will be removed.
                    </p>
                    <div className="flex justify-center gap-3">
                        <button 
                            onClick={() => setStationToDelete(null)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDeleteStation}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors"
                        >
                            Yes, Delete
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* STATION FORM MODAL */}
      {isStationModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden max-h-[90vh] overflow-y-auto">
                <div className="bg-white px-6 py-4 border-b border-gray-100 flex justify-between items-center sticky top-0 z-10">
                    <h3 className="font-bold text-gray-800 text-lg">{currentStation.id ? 'Edit Vendor' : 'New Vendor'}</h3>
                    <button onClick={() => setIsStationModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <form onSubmit={handleSaveStation} className="p-6 space-y-6">
                    <div className="space-y-4">
                        <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Vendor Details</h4>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Company Name</label>
                            <input 
                                type="text" 
                                required
                                value={currentStation.name || ''}
                                onChange={(e) => setCurrentStation({...currentStation, name: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                placeholder="e.g. Aneka Gas"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Contact Name</label>
                                <input 
                                    type="text" 
                                    value={currentStation.contactPerson || ''}
                                    onChange={(e) => setCurrentStation({...currentStation, contactPerson: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                                <input 
                                    type="text" 
                                    value={currentStation.phone || ''}
                                    onChange={(e) => setCurrentStation({...currentStation, phone: e.target.value})}
                                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                />
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Full Address</label>
                            <textarea 
                                value={currentStation.address || ''}
                                onChange={(e) => setCurrentStation({...currentStation, address: e.target.value})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                                rows={2}
                            />
                        </div>
                    </div>

                    <div className="space-y-3">
                        <div className="flex justify-between items-center">
                            <h4 className="font-bold text-xs text-gray-400 uppercase tracking-wider">Refill Pricing</h4>
                            <button 
                                type="button" 
                                onClick={addPriceRow}
                                className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                            >
                                <span className="material-icons text-sm">add_circle</span> Add Rate
                            </button>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4 space-y-3 border border-gray-100">
                            {editingPrices.length === 0 ? (
                                <p className="text-xs text-center text-gray-400 py-2">No custom rates configured.</p>
                            ) : (
                                editingPrices.map((price, idx) => (
                                    <div key={idx} className="flex gap-2 items-center flex-wrap sm:flex-nowrap">
                                        <div className="grid grid-cols-2 gap-2 flex-1 min-w-[140px]">
                                            <select 
                                                value={price.gasType}
                                                onChange={(e) => updatePriceRow(idx, 'gasType', e.target.value)}
                                                className="text-xs border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-indigo-500 border bg-white"
                                            >
                                                {Object.values(GasType).map(g => <option key={g} value={g}>{g}</option>)}
                                            </select>
                                            <select 
                                                value={price.size}
                                                onChange={(e) => updatePriceRow(idx, 'size', e.target.value)}
                                                className="text-xs border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-indigo-500 border bg-white"
                                            >
                                                {Object.values(CylinderSize).map(s => <option key={s} value={s}>{s}</option>)}
                                            </select>
                                        </div>
                                        <div className="flex gap-2 items-center flex-1">
                                            <input 
                                                type="text"
                                                value={price.serialCode || ''}
                                                onChange={(e) => updatePriceRow(idx, 'serialCode', e.target.value)}
                                                className="w-full text-xs border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-indigo-500 border uppercase font-mono"
                                                placeholder="Code/SKU (Optional)"
                                            />
                                            <input 
                                                type="number"
                                                value={price.price}
                                                onChange={(e) => updatePriceRow(idx, 'price', parseFloat(e.target.value))}
                                                className="w-24 text-xs border-gray-300 rounded-lg px-2 py-2 outline-none focus:border-indigo-500 border"
                                                placeholder="Cost"
                                            />
                                        </div>
                                        <button type="button" onClick={() => removePriceRow(idx)} className="text-gray-400 hover:text-red-500 p-1">
                                            <span className="material-icons text-sm">remove_circle</span>
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                    
                    <div className="pt-4 flex justify-end gap-3 border-t border-gray-100 sticky bottom-0 bg-white pb-2">
                        <button 
                            type="button"
                            onClick={() => setIsStationModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                        >
                            Save Details
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}
    </div>
  );
};

export default RefillView;