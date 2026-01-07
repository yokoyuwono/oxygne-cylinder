
import React, { useState, useEffect, useCallback } from 'react';
import { Cylinder, CylinderStatus } from '../types';
import { supabase } from '../lib/supabase';

interface DeliveryViewProps {
  cylinders: Cylinder[]; // Kept for interface compatibility, but unused for the main list
  onDeliver: (cylinderIds: string[], date: string) => void;
}

const DeliveryView: React.FC<DeliveryViewProps> = ({ onDeliver }) => {
  const [deliveryDate, setDeliveryDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  
  // -- Server-Side State --
  const [serverCylinders, setServerCylinders] = useState<Cylinder[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const ITEMS_PER_PAGE = 20; // Increased density

  // -- Debounce Search --
  useEffect(() => {
    const handler = setTimeout(() => {
        setDebouncedSearch(searchTerm);
        setCurrentPage(1);
    }, 500);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  // -- Fetch Data --
  const fetchCylinders = useCallback(async () => {
      setIsLoading(true);
      try {
          let query = supabase
            .from('cylinders')
            .select('*', { count: 'exact' })
            .eq('status', CylinderStatus.Available);

          if (debouncedSearch) {
              query = query.or(`serialCode.ilike.%${debouncedSearch}%,gasType.ilike.%${debouncedSearch}%`);
          }

          const from = (currentPage - 1) * ITEMS_PER_PAGE;
          const to = from + ITEMS_PER_PAGE - 1;

          const { data, count, error } = await query
            .order('serialCode', { ascending: true })
            .range(from, to);

          if (error) throw error;

          if (data) setServerCylinders(data);
          if (count !== null) setTotalCount(count);

      } catch (err) {
          console.error("Error fetching delivery candidates:", err);
      } finally {
          setIsLoading(false);
      }
  }, [debouncedSearch, currentPage]);

  useEffect(() => {
      fetchCylinders();
  }, [fetchCylinders]);

  // -- Handlers --
  const toggleSelection = (id: string) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(sid => sid !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleSelectPage = () => {
    const pageIds = serverCylinders.map(c => c.id);
    const allSelected = pageIds.every(id => selectedIds.includes(id));
    
    if (allSelected) {
        // Deselect all on this page
        setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
    } else {
        // Select all on this page
        const newIds = [...selectedIds];
        pageIds.forEach(id => {
            if (!newIds.includes(id)) newIds.push(id);
        });
        setSelectedIds(newIds);
    }
  };

  const handleConfirm = () => {
    onDeliver(selectedIds, deliveryDate);
    setSelectedIds([]);
    setIsConfirmOpen(false);
    // Refresh list
    setTimeout(fetchCylinders, 500);
  };

  // -- Pagination Controls Component --
  const totalPages = Math.ceil(totalCount / ITEMS_PER_PAGE);
  const Pagination = () => (
      <div className="flex items-center gap-2 text-sm bg-white p-1 rounded-lg border border-gray-200">
          <button 
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1 || isLoading}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 transition-colors"
          >
              <span className="material-icons text-gray-600 text-sm">chevron_left</span>
          </button>
          <span className="text-gray-600 font-medium px-2 text-xs">
              Page {currentPage} of {totalPages || 1}
          </span>
          <button 
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0 || isLoading}
              className="p-1.5 hover:bg-gray-100 rounded disabled:opacity-30 transition-colors"
          >
              <span className="material-icons text-gray-600 text-sm">chevron_right</span>
          </button>
      </div>
  );

  return (
    <div className="space-y-6 animate-fade-in-up pb-20 md:pb-0">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold text-gray-800">Delivery Management</h2>
           <p className="text-gray-500 text-sm">Select cylinders to send out for delivery.</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 w-full md:w-auto">
            <div className="relative">
                <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">event</span>
                <input 
                    type="date" 
                    value={deliveryDate}
                    onChange={(e) => setDeliveryDate(e.target.value)}
                    className="pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none w-full"
                />
            </div>
            <button 
                onClick={() => setIsConfirmOpen(true)}
                disabled={selectedIds.length === 0}
                className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-500 text-white px-6 py-2 rounded-lg text-sm font-bold shadow-md transition-colors flex items-center justify-center gap-2"
            >
                <span className="material-icons text-sm">local_shipping</span>
                Process Delivery ({selectedIds.length})
            </button>
        </div>
      </div>

      {/* Selection Area */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden flex flex-col min-h-[600px]">
          {/* Toolbar */}
          <div className="p-4 bg-gray-50 border-b border-gray-100 flex flex-col sm:flex-row justify-between items-center gap-4">
              <div className="relative w-full sm:w-64">
                  <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
                  <input 
                      type="text" 
                      placeholder="Search available cylinders..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 outline-none"
                  />
              </div>
              
              <div className="flex items-center justify-between w-full sm:w-auto gap-4">
                  <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-500 hidden sm:inline">Selected: <strong className="text-blue-600">{selectedIds.length}</strong></span>
                      <button onClick={handleSelectPage} className="text-blue-600 hover:text-blue-800 font-medium text-xs sm:text-sm bg-blue-50 px-2 py-1 rounded">
                          Toggle Page
                      </button>
                  </div>
                  {/* Top Pagination */}
                  <Pagination />
              </div>
          </div>

          {/* Grid List */}
          <div className="flex-1 overflow-y-auto bg-gray-50/50 p-4">
              {isLoading ? (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin mb-3"></div>
                      <p>Loading cylinders...</p>
                  </div>
              ) : serverCylinders.length > 0 ? (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {serverCylinders.map(c => {
                          const isSelected = selectedIds.includes(c.id);
                          return (
                              <div 
                                key={c.id} 
                                onClick={() => toggleSelection(c.id)}
                                className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                                    isSelected 
                                    ? 'bg-blue-50 border-blue-300 shadow-sm' 
                                    : 'bg-white border-gray-200 hover:border-blue-200'
                                }`}
                              >
                                  <div className={`w-5 h-5 rounded border flex items-center justify-center shrink-0 transition-colors ${isSelected ? 'bg-blue-600 border-blue-600' : 'border-gray-300 bg-white'}`}>
                                      {isSelected && <span className="material-icons text-white text-[10px] font-bold">check</span>}
                                  </div>
                                  
                                  <div className="flex-1 grid grid-cols-12 gap-2 items-center">
                                      {/* Serial & Gas */}
                                      <div className="col-span-5 sm:col-span-4">
                                          <p className="font-mono font-bold text-gray-800 text-sm">{c.serialCode}</p>
                                      </div>
                                      
                                      {/* Details */}
                                      <div className="col-span-4 sm:col-span-4 flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2">
                                          <span className="text-xs font-medium text-gray-600">{c.gasType}</span>
                                          <span className="text-[10px] text-gray-400 border border-gray-200 px-1.5 rounded bg-gray-50 w-fit">{c.size}</span>
                                      </div>

                                      {/* Location */}
                                      <div className="col-span-3 sm:col-span-4 text-right flex justify-end items-center gap-1 text-gray-400">
                                          <span className="material-icons text-[10px]">place</span>
                                          <span className="text-xs truncate max-w-[80px] sm:max-w-none">{c.lastLocation}</span>
                                      </div>
                                  </div>
                              </div>
                          );
                      })}
                  </div>
              ) : (
                  <div className="flex flex-col items-center justify-center h-64 text-gray-400">
                      <span className="material-icons text-4xl mb-2 text-gray-300">block</span>
                      <p>No available cylinders found.</p>
                  </div>
              )}
          </div>

          {/* Bottom Footer */}
          <div className="p-3 bg-white border-t border-gray-200 flex justify-between items-center">
              <span className="text-xs text-gray-400">
                  Total Items: {totalCount}
              </span>
              {/* Bottom Pagination */}
              <Pagination />
          </div>
      </div>

      {/* Confirmation Modal */}
      {isConfirmOpen && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm animate-fade-in pt-12 md:pt-20">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
                  <div className="bg-blue-600 px-6 py-4 flex justify-between items-center text-white">
                      <h3 className="font-bold flex items-center gap-2">
                          <span className="material-icons">local_shipping</span>
                          Confirm Delivery
                      </h3>
                      <button onClick={() => setIsConfirmOpen(false)} className="text-blue-100 hover:text-white">
                          <span className="material-icons">close</span>
                      </button>
                  </div>
                  <div className="p-6">
                      <p className="text-gray-600 mb-4">
                          You are about to mark <strong>{selectedIds.length}</strong> cylinders as <strong>In Delivery</strong>.
                      </p>
                      <div className="bg-gray-50 p-3 rounded-lg border border-gray-200 mb-6 text-sm">
                          <div className="flex justify-between mb-1">
                              <span className="text-gray-500">Date:</span>
                              <span className="font-medium">{new Date(deliveryDate).toLocaleDateString()}</span>
                          </div>
                          <div className="flex justify-between">
                              <span className="text-gray-500">Items:</span>
                              <span className="font-medium">{selectedIds.length}</span>
                          </div>
                      </div>
                      <div className="flex justify-end gap-3">
                          <button 
                              onClick={() => setIsConfirmOpen(false)}
                              className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                          >
                              Cancel
                          </button>
                          <button 
                              onClick={handleConfirm}
                              className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-bold shadow-md transition-colors"
                          >
                              Confirm
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default DeliveryView;
