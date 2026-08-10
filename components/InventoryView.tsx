import React from 'react';
import { Cylinder, Transaction } from '../types';
import CylinderList from './CylinderList';

interface InventoryViewProps {
  cylinders: Cylinder[];
  transactions: Transaction[];
  onAdd: (cylinder: Cylinder) => void;
  onBulkAdd: (cylinders: Cylinder[]) => void;
  onUpdate: (cylinder: Cylinder) => void;
  onDelete: (id: string) => void;
}

/**
 * Halaman Stok Tabung. Regulator dipindahkan ke Master Data -- tidak dilacak
 * per unit lagi, jadi tidak butuh tab atau halamannya sendiri di sini.
 */
const InventoryView: React.FC<InventoryViewProps> = ({
  cylinders, transactions, onAdd, onBulkAdd, onUpdate, onDelete,
}) => {
  return (
    <div className="space-y-6 animate-fade-in-up pb-20 md:pb-0">
      <CylinderList
        cylinders={cylinders}
        transactions={transactions}
        onAdd={onAdd}
        onBulkAdd={onBulkAdd}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
    </div>
  );
};

export default InventoryView;
