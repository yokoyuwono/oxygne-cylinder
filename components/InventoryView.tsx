import React, { useState } from 'react';
import { Cylinder, Transaction, Regulator } from '../types';
import CylinderList from './CylinderList';
import RegulatorList from './RegulatorList';

interface InventoryViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  regulators: Regulator[];
  onAdd: (cylinder: Cylinder) => void;
  onBulkAdd: (cylinders: Cylinder[]) => void;
  onUpdate: (cylinder: Cylinder) => void;
  onDelete: (id: string) => void;
  onRefresh: () => Promise<void>;
}

/**
 * Pembungkus tab untuk halaman stok. Tabung dan regulator sama-sama aset
 * berstatus yang dipegang pelanggan, jadi keduanya tinggal di satu halaman.
 * CylinderList sengaja tidak diubah -- komponen itu mengelola pencarian dan
 * paginasinya sendiri di sisi server.
 */
const InventoryView: React.FC<InventoryViewProps> = ({
  cylinders, transactions, regulators, onAdd, onBulkAdd, onUpdate, onDelete, onRefresh,
}) => {
  const [activeTab, setActiveTab] = useState<'cylinder' | 'regulator'>('cylinder');

  const tabs = [
    { id: 'cylinder', label: 'Tabung', icon: 'propane', count: cylinders.length },
    { id: 'regulator', label: 'Regulator', icon: 'settings_input_component', count: regulators.length },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up pb-20 md:pb-0">
      <div className="flex gap-6 border-b border-gray-200">
        {tabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as 'cylinder' | 'regulator')}
            className={`pb-4 px-2 text-sm font-medium transition-all relative flex items-center gap-2 whitespace-nowrap ${activeTab === tab.id ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'}`}
          >
            <span className="material-icons text-lg">{tab.icon}</span>
            {tab.label}
            <span className={`text-xs px-2 py-0.5 rounded-full ${activeTab === tab.id ? 'bg-indigo-100 text-indigo-700' : 'bg-gray-100 text-gray-500'}`}>
              {tab.count}
            </span>
            {activeTab === tab.id && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-600 rounded-full" />}
          </button>
        ))}
      </div>

      {activeTab === 'cylinder' ? (
        <CylinderList
          cylinders={cylinders}
          transactions={transactions}
          onAdd={onAdd}
          onBulkAdd={onBulkAdd}
          onUpdate={onUpdate}
          onDelete={onDelete}
        />
      ) : (
        <RegulatorList regulators={regulators} onRefresh={onRefresh} />
      )}
    </div>
  );
};

export default InventoryView;
