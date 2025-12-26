
import React, { useState, useRef } from 'react';
import { Cylinder, CylinderStatus, GasType, CylinderSize, Transaction } from '../types';

interface CylinderListProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  onAdd: (cylinder: Cylinder) => void;
  onBulkAdd: (cylinders: Cylinder[]) => void;
  onUpdate: (cylinder: Cylinder) => void;
  onDelete: (id: string) => void;
}

const CylinderList: React.FC<CylinderListProps> = ({ cylinders, transactions, onAdd, onBulkAdd, onUpdate, onDelete }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('All');
  
  // -- CRUD Modal State --
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [currentCyl, setCurrentCyl] = useState<Partial<Cylinder>>({
      gasType: GasType.Oxygen,
      size: CylinderSize.Large,
      status: CylinderStatus.Available,
      lastLocation: 'Gudang Utama'
  });

  // -- Import CSV Modal State --
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [importedData, setImportedData] = useState<Partial<Cylinder>[]>([]);
  const [importErrors, setImportErrors] = useState<Record<number, string>>({}); // rowIndex -> errorMessage
  const fileInputRef = useRef<HTMLInputElement>(null);

  // -- Delete Confirmation State --
  const [cylinderToDelete, setCylinderToDelete] = useState<Cylinder | null>(null);

  const filteredCylinders = cylinders.filter(c => {
    const matchesSearch = c.serialCode.toLowerCase().includes(searchTerm.toLowerCase()) || 
                          c.gasType.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = filterStatus === 'All' || c.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const getStatusColor = (status: CylinderStatus) => {
    switch (status) {
      case CylinderStatus.Available: return 'bg-green-100 text-green-800';
      case CylinderStatus.Rented: return 'bg-blue-100 text-blue-800';
      case CylinderStatus.EmptyRefill: return 'bg-orange-100 text-orange-800';
      case CylinderStatus.Refilling: return 'bg-yellow-100 text-yellow-800';
      case CylinderStatus.Damaged: return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getRentalDuration = (cylId: string) => {
    // Find the latest RENTAL_OUT transaction for this cylinder
    const lastRentTx = transactions
        .filter(t => t.cylinderId === cylId && t.type === 'RENTAL_OUT')
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0];
    
    if (!lastRentTx) return null;

    const diffMs = new Date().getTime() - new Date(lastRentTx.date).getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    
    const isLongTerm = diffDays > 30;
    const text = diffDays === 0 ? 'Today' : `${diffDays} Day${diffDays > 1 ? 's' : ''}`;

    return { text, isLongTerm };
  };

  // Handlers
  const handleOpenAdd = () => {
    setIsEditing(false);
    setCurrentCyl({
      serialCode: '',
      gasType: GasType.Oxygen,
      size: CylinderSize.Large,
      status: CylinderStatus.Available,
      lastLocation: 'Gudang Utama'
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cyl: Cylinder) => {
    setIsEditing(true);
    setCurrentCyl({ ...cyl });
    setIsModalOpen(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentCyl.serialCode) return;

    if (isEditing && currentCyl.id) {
        onUpdate(currentCyl as Cylinder);
    } else {
        const newCyl: Cylinder = {
            id: `c-${Date.now()}`,
            serialCode: currentCyl.serialCode,
            gasType: currentCyl.gasType as GasType,
            size: currentCyl.size as CylinderSize,
            status: currentCyl.status as CylinderStatus || CylinderStatus.Available,
            lastLocation: currentCyl.lastLocation || 'Gudang Utama',
            currentHolder: currentCyl.currentHolder
        };
        onAdd(newCyl);
    }
    setIsModalOpen(false);
  };

  const confirmDelete = () => {
      if (cylinderToDelete) {
          onDelete(cylinderToDelete.id);
          setCylinderToDelete(null);
      }
  };

  // --- CSV Import Logic ---

  const downloadTemplate = () => {
    const headers = ['serialCode', 'gasType', 'size', 'status', 'lastLocation'];
    const example1 = ['OXY-NEW-001', 'Oxygen', '6m3', 'Available', 'Gudang Utama'];
    const example2 = ['ARG-NEW-002', 'Argon', '2m3', 'Available', 'Gudang Utama'];
    
    const csvContent = [
        headers.join(','),
        example1.join(','),
        example2.join(',')
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'cylinder_import_template.csv';
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const text = event.target?.result as string;
        parseCSV(text);
    };
    reader.readAsText(file);
    
    // Reset input so same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const parseCSV = (csvText: string) => {
      const lines = csvText.split('\n').map(line => line.trim()).filter(line => line);
      if (lines.length < 2) {
          alert("CSV is empty or missing headers");
          return;
      }

      // Headers should be: serialCode, gasType, size, status, lastLocation
      // We assume order or check indices, but simple approach is standard index
      const dataRows = lines.slice(1);
      const parsed: Partial<Cylinder>[] = [];
      const errors: Record<number, string> = {};
      
      const validGasTypes = Object.values(GasType);
      const validSizes = Object.values(CylinderSize);
      const validStatuses = Object.values(CylinderStatus);

      dataRows.forEach((row, index) => {
          const cols = row.split(',').map(c => c.trim());
          if (cols.length < 3) return; // Skip malformed rows

          const [serialCode, gasTypeStr, sizeStr, statusStr, location] = cols;

          // Validate
          let error = '';
          
          // Check Duplicates in existing DB
          if (cylinders.some(c => c.serialCode === serialCode)) {
             error = 'Duplicate Serial Code (Exists in DB)';
          }
          // Check Duplicates in current import batch
          else if (parsed.some(p => p.serialCode === serialCode)) {
              error = 'Duplicate Serial Code (Double entry in file)';
          }
          else if (!validGasTypes.includes(gasTypeStr as GasType)) {
              error = `Invalid Gas Type. Valid: ${validGasTypes.join(', ')}`;
          }
          else if (!validSizes.includes(sizeStr as CylinderSize)) {
              error = `Invalid Size. Valid: ${validSizes.join(', ')}`;
          }

          if (error) {
              errors[index] = error;
          }

          parsed.push({
              serialCode,
              gasType: gasTypeStr as GasType,
              size: sizeStr as CylinderSize,
              status: (statusStr && validStatuses.includes(statusStr as CylinderStatus)) ? statusStr as CylinderStatus : CylinderStatus.Available,
              lastLocation: location || 'Gudang Utama'
          });
      });

      setImportedData(parsed);
      setImportErrors(errors);
  };

  const handleConfirmImport = () => {
      const validItems = importedData.filter((_, idx) => !importErrors[idx]);
      if (validItems.length === 0) return;

      const newCylinders = validItems.map(item => ({
          id: `c-imp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          serialCode: item.serialCode!,
          gasType: item.gasType!,
          size: item.size!,
          status: item.status!,
          lastLocation: item.lastLocation!,
          currentHolder: undefined
      }));

      onBulkAdd(newCylinders);
      
      setIsImportModalOpen(false);
      setImportedData([]);
      setImportErrors({});
  };

  return (
    <div className="space-y-4 animate-fade-in">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <h2 className="text-2xl font-bold text-gray-800">Inventory</h2>
        <div className="flex gap-2 w-full md:w-auto">
          <div className="relative flex-1 md:w-64">
            <span className="material-icons absolute left-3 top-2.5 text-gray-400 text-sm">search</span>
            <input 
              type="text" 
              placeholder="Search code or gas..." 
              className="w-full pl-9 pr-4 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <select 
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none bg-white"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
          >
            <option value="All">All Status</option>
            {Object.values(CylinderStatus).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          
          {/* Action Buttons */}
          <div className="flex gap-2">
            <button 
                onClick={() => setIsImportModalOpen(true)}
                className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
                <span className="material-icons text-sm">upload_file</span>
                Import
            </button>
            <button 
                onClick={handleOpenAdd}
                className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
            >
                <span className="material-icons text-sm">add</span>
                Add
            </button>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-gray-600">
            <thead className="bg-gray-50 text-gray-700 uppercase font-medium">
              <tr>
                <th className="px-6 py-3">Code</th>
                <th className="px-6 py-3">Gas Type</th>
                <th className="px-6 py-3">Size</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Location</th>
                <th className="px-6 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCylinders.length > 0 ? (
                filteredCylinders.map((cyl) => {
                  const duration = cyl.status === CylinderStatus.Rented ? getRentalDuration(cyl.id) : null;

                  return (
                    <tr key={cyl.id} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 font-medium text-gray-900 font-mono">{cyl.serialCode}</td>
                      <td className="px-6 py-4">{cyl.gasType}</td>
                      <td className="px-6 py-4">{cyl.size}</td>
                      <td className="px-6 py-4">
                        <div className="flex flex-col items-start gap-1">
                          <span className={`px-2 py-1 rounded-full text-xs font-semibold ${getStatusColor(cyl.status)}`}>
                            {cyl.status}
                          </span>
                          {duration && (
                            <span className={`text-[10px] font-medium flex items-center gap-1 ${duration.isLongTerm ? 'text-red-600' : 'text-gray-500'}`}>
                              <span className="material-icons text-[10px]">history</span>
                              {duration.text}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-gray-500">{cyl.lastLocation}</td>
                      <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-2">
                              <button onClick={() => handleOpenEdit(cyl)} className="text-gray-400 hover:text-indigo-600">
                                  <span className="material-icons text-sm">edit</span>
                              </button>
                              <button onClick={() => setCylinderToDelete(cyl)} className="text-gray-400 hover:text-red-500">
                                  <span className="material-icons text-sm">delete</span>
                              </button>
                          </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-8 text-center text-gray-400">
                    No cylinders found matching your search.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* CRUD Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-md mx-4 overflow-hidden animate-fade-in-up">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                    <h3 className="font-bold text-gray-800">{isEditing ? 'Edit Cylinder' : 'Add New Cylinder'}</h3>
                    <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <form onSubmit={handleSubmit} className="p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Serial Code</label>
                        <input 
                            type="text" 
                            required
                            value={currentCyl.serialCode}
                            onChange={(e) => setCurrentCyl({...currentCyl, serialCode: e.target.value.toUpperCase()})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none uppercase font-mono"
                            placeholder="e.g. OXY-9999"
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Gas Type</label>
                            <select 
                                value={currentCyl.gasType}
                                onChange={(e) => setCurrentCyl({...currentCyl, gasType: e.target.value as GasType})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {Object.values(GasType).map(g => <option key={g} value={g}>{g}</option>)}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700 mb-1">Size</label>
                            <select 
                                value={currentCyl.size}
                                onChange={(e) => setCurrentCyl({...currentCyl, size: e.target.value as CylinderSize})}
                                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                            >
                                {Object.values(CylinderSize).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                        </div>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Current Status</label>
                        <select 
                            value={currentCyl.status}
                            onChange={(e) => setCurrentCyl({...currentCyl, status: e.target.value as CylinderStatus})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        >
                            {Object.values(CylinderStatus).map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Last Location</label>
                        <input 
                            type="text" 
                            value={currentCyl.lastLocation}
                            onChange={(e) => setCurrentCyl({...currentCyl, lastLocation: e.target.value})}
                            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 outline-none"
                        />
                    </div>
                    
                    <div className="pt-2 flex justify-end gap-3">
                        <button 
                            type="button"
                            onClick={() => setIsModalOpen(false)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            type="submit"
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-sm font-medium transition-colors"
                        >
                            {isEditing ? 'Save Changes' : 'Create Cylinder'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
      )}

      {/* IMPORT CSV MODAL */}
      {isImportModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 overflow-hidden animate-fade-in-up max-h-[90vh] flex flex-col">
                <div className="bg-gray-50 px-6 py-4 border-b border-gray-100 flex justify-between items-center shrink-0">
                    <h3 className="font-bold text-gray-800 flex items-center gap-2">
                        <span className="material-icons text-green-600">table_view</span>
                        Import Cylinders
                    </h3>
                    <button onClick={() => {setIsImportModalOpen(false); setImportedData([]); setImportErrors({})}} className="text-gray-400 hover:text-gray-600">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                
                <div className="p-6 overflow-y-auto flex-1">
                    {/* Step 1: Upload */}
                    {importedData.length === 0 ? (
                        <div className="space-y-6">
                             <div className="bg-blue-50 border border-blue-100 p-4 rounded-lg text-sm text-blue-800">
                                 <p className="font-bold mb-1">Instructions:</p>
                                 <ul className="list-disc pl-5 space-y-1">
                                     <li>File must be a <strong>.csv</strong> format.</li>
                                     <li>Columns order: <strong>serialCode, gasType, size, status, lastLocation</strong>.</li>
                                     <li>Valid Gas Types: {Object.values(GasType).join(', ')}.</li>
                                     <li>Valid Sizes: {Object.values(CylinderSize).join(', ')}.</li>
                                 </ul>
                             </div>

                             <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 flex flex-col items-center justify-center bg-gray-50 text-center hover:bg-gray-100 transition-colors cursor-pointer" onClick={() => fileInputRef.current?.click()}>
                                 <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4">
                                     <span className="material-icons text-3xl text-indigo-500">upload_file</span>
                                 </div>
                                 <p className="text-gray-700 font-medium">Click to upload CSV file</p>
                                 <p className="text-xs text-gray-400 mt-1">Maximum 5MB</p>
                                 <input 
                                     type="file" 
                                     ref={fileInputRef}
                                     accept=".csv"
                                     className="hidden"
                                     onChange={handleFileUpload}
                                 />
                             </div>

                             <div className="text-center">
                                 <button onClick={downloadTemplate} className="text-indigo-600 text-sm font-medium hover:underline flex items-center justify-center gap-1 mx-auto">
                                     <span className="material-icons text-sm">download</span> Download CSV Template
                                 </button>
                             </div>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="flex justify-between items-center">
                                <div>
                                    <h4 className="font-bold text-gray-800">Preview Data</h4>
                                    <p className="text-xs text-gray-500">
                                        Found {importedData.length} rows. 
                                        {Object.keys(importErrors).length > 0 && <span className="text-red-500 ml-1 font-bold">{Object.keys(importErrors).length} errors found.</span>}
                                    </p>
                                </div>
                                <button onClick={() => {setImportedData([]); setImportErrors({})}} className="text-sm text-red-500 hover:text-red-700">
                                    Clear & Re-upload
                                </button>
                            </div>

                            <div className="border border-gray-200 rounded-lg overflow-hidden max-h-[300px] overflow-y-auto">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-gray-50 text-gray-600 font-medium sticky top-0">
                                        <tr>
                                            <th className="px-4 py-2">Status</th>
                                            <th className="px-4 py-2">Code</th>
                                            <th className="px-4 py-2">Gas</th>
                                            <th className="px-4 py-2">Size</th>
                                            <th className="px-4 py-2">Location</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-gray-100">
                                        {importedData.map((row, idx) => (
                                            <tr key={idx} className={importErrors[idx] ? 'bg-red-50' : 'bg-white'}>
                                                <td className="px-4 py-2">
                                                    {importErrors[idx] ? (
                                                        <span className="text-red-600 font-bold flex items-center gap-1">
                                                            <span className="material-icons text-sm">error</span> Error
                                                        </span>
                                                    ) : (
                                                        <span className="text-green-600 font-bold flex items-center gap-1">
                                                            <span className="material-icons text-sm">check_circle</span> Valid
                                                        </span>
                                                    )}
                                                    {importErrors[idx] && <p className="text-[10px] text-red-600 mt-1">{importErrors[idx]}</p>}
                                                </td>
                                                <td className="px-4 py-2 font-mono">{row.serialCode}</td>
                                                <td className="px-4 py-2">{row.gasType}</td>
                                                <td className="px-4 py-2">{row.size}</td>
                                                <td className="px-4 py-2 text-gray-500">{row.lastLocation}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}
                </div>

                {importedData.length > 0 && (
                    <div className="p-6 bg-gray-50 border-t border-gray-100 flex justify-end gap-3 shrink-0">
                        <button 
                            onClick={() => {setIsImportModalOpen(false); setImportedData([]); setImportErrors({})}}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={handleConfirmImport}
                            disabled={Object.keys(importErrors).length === importedData.length}
                            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white rounded-lg text-sm font-bold shadow-md transition-colors flex items-center gap-2"
                        >
                            <span className="material-icons text-sm">save_alt</span>
                            Import {importedData.length - Object.keys(importErrors).length} Cylinders
                        </button>
                    </div>
                )}
            </div>
        </div>
      )}

      {/* DELETE CONFIRMATION MODAL */}
      {cylinderToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 overflow-hidden animate-fade-in-up">
                <div className="bg-red-600 px-6 py-4 border-b border-red-700 flex justify-between items-center text-white">
                    <h3 className="font-bold flex items-center gap-2">
                        <span className="material-icons">warning</span>
                        Confirm Deletion
                    </h3>
                    <button onClick={() => setCylinderToDelete(null)} className="text-red-100 hover:text-white">
                        <span className="material-icons">close</span>
                    </button>
                </div>
                <div className="p-6">
                    <p className="text-gray-700 text-sm mb-4">
                        Are you sure you want to delete cylinder <strong>{cylinderToDelete.serialCode}</strong>?
                    </p>
                    <p className="text-xs text-red-600 bg-red-50 p-2 rounded mb-4">
                        This action cannot be undone and will remove the cylinder from inventory records.
                    </p>
                    <div className="flex justify-end gap-3">
                        <button 
                            onClick={() => setCylinderToDelete(null)}
                            className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm font-medium transition-colors"
                        >
                            Cancel
                        </button>
                        <button 
                            onClick={confirmDelete}
                            className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-bold shadow-md shadow-red-200 transition-colors"
                        >
                            Delete Cylinder
                        </button>
                    </div>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default CylinderList;
