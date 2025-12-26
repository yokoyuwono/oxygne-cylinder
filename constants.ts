
import { Cylinder, CylinderSize, CylinderStatus, GasType, Member, MemberPrice, Transaction, RefillStation, RefillPrice, AppUser, UserRole, MemberStatus } from './types';

export const MOCK_USERS: AppUser[] = [
  { id: 'u1', username: 'admin', password: 'password123', name: 'Super Admin', role: UserRole.Admin, lastLogin: '2023-10-27T08:30:00Z' },
  { id: 'u2', username: 'operator', password: 'password123', name: 'Warehouse Staff', role: UserRole.Operator, lastLogin: '2023-10-26T17:00:00Z' },
  { id: 'u3', username: 'viewer', password: 'password123', name: 'Auditor', role: UserRole.Viewer, lastLogin: '2023-10-25T09:15:00Z' },
];

export const MOCK_MEMBERS: Member[] = [
  { id: 'm1', name: 'Budi Santoso', companyName: 'Bengkel Maju Jaya', address: 'Jl. Raya Bogor KM 28, Jakarta Timur', phone: '0812-3456-7890', totalDeposit: 2000000, totalDebt: 0, joinDate: '2023-01-15T00:00:00Z', status: MemberStatus.Active },
  { id: 'm2', name: 'Siti Aminah', companyName: 'CV Berkah Abadi', address: 'Kawasan Industri Pulogadung Blok A2, Jakarta', phone: '0813-9876-5432', totalDeposit: 0, totalDebt: 450000, joinDate: '2023-03-10T00:00:00Z', status: MemberStatus.Active },
  { id: 'm3', name: 'Admin Proyek', companyName: 'PT Konstruksi Utama', address: 'Jl. Jend. Sudirman Kav 50, Jakarta Selatan', phone: '0811-2233-4455', totalDeposit: 5000000, totalDebt: 0, joinDate: '2022-11-05T00:00:00Z', status: MemberStatus.Active },
];

export const MOCK_REFILL_STATIONS: RefillStation[] = [
  { id: 'rs1', name: 'GasDepo Pusat', address: 'Jl. Industri No 5, Cikarang', contactPerson: 'Pak Joko', phone: '021-898989' },
  { id: 'rs2', name: 'Aneka Gas Bogor', address: 'Jl. Pajajaran No 12, Bogor', contactPerson: 'Ibu Lina', phone: '0251-334455' },
];

export const MOCK_CYLINDERS: Cylinder[] = [
  { id: 'c1', serialCode: 'OXY-1001', gasType: GasType.Oxygen, size: CylinderSize.Large, status: CylinderStatus.Available, lastLocation: 'Gudang Utama' },
  { id: 'c2', serialCode: 'OXY-1002', gasType: GasType.Oxygen, size: CylinderSize.Large, status: CylinderStatus.Rented, currentHolder: 'm1', lastLocation: 'Bengkel Maju Jaya' },
  { id: 'c3', serialCode: 'ACE-2001', gasType: GasType.Acetylene, size: CylinderSize.Medium, status: CylinderStatus.Available, lastLocation: 'Gudang Utama' },
  { id: 'c4', serialCode: 'ARG-3001', gasType: GasType.Argon, size: CylinderSize.Large, status: CylinderStatus.EmptyRefill, lastLocation: 'Gudang Utama' },
  { id: 'c5', serialCode: 'CO2-4001', gasType: GasType.CO2, size: CylinderSize.Small, status: CylinderStatus.Available, lastLocation: 'Gudang Utama' },
  { id: 'c6', serialCode: 'NIT-5001', gasType: GasType.Nitrogen, size: CylinderSize.Large, status: CylinderStatus.Rented, currentHolder: 'm3', lastLocation: 'PT Konstruksi Utama' },
  { id: 'c7', serialCode: 'OXY-1003', gasType: GasType.Oxygen, size: CylinderSize.Medium, status: CylinderStatus.Refilling, lastLocation: 'GasDepo Pusat' },
  { id: 'c8', serialCode: 'ACE-2002', gasType: GasType.Acetylene, size: CylinderSize.Medium, status: CylinderStatus.Available, lastLocation: 'Gudang Utama' },
  { id: 'c9', serialCode: 'ARG-3002', gasType: GasType.Argon, size: CylinderSize.Large, status: CylinderStatus.Rented, currentHolder: 'm2', lastLocation: 'CV Berkah Abadi' },
  { id: 'c10', serialCode: 'CO2-4002', gasType: GasType.CO2, size: CylinderSize.Small, status: CylinderStatus.Damaged, lastLocation: 'Gudang - Area Perbaikan' },
];

export const MOCK_TRANSACTIONS: Transaction[] = [
  { id: 't1', cylinderId: 'c2', memberId: 'm1', type: 'RENTAL_OUT', date: '2023-10-25T10:00:00Z', paymentStatus: 'PAID' },
  { id: 't2', cylinderId: 'c6', memberId: 'm3', type: 'RENTAL_OUT', date: '2023-10-26T14:30:00Z', paymentStatus: 'PAID' },
];

export const MOCK_MEMBER_PRICES: MemberPrice[] = [
  // Bengkel Maju Jaya - Preferential rates on Oxygen
  { id: 'mp1', memberId: 'm1', gasType: GasType.Oxygen, size: CylinderSize.Large, price: 185000 },
  { id: 'mp2', memberId: 'm1', gasType: GasType.Oxygen, size: CylinderSize.Medium, price: 125000 },
  { id: 'mp3', memberId: 'm1', gasType: GasType.Acetylene, size: CylinderSize.Medium, price: 375000 },
  
  // CV Berkah Abadi - Standard rates
  { id: 'mp4', memberId: 'm2', gasType: GasType.Argon, size: CylinderSize.Large, price: 525000 },
  
  // PT Konstruksi Utama - High volume discounts
  { id: 'mp5', memberId: 'm3', gasType: GasType.Nitrogen, size: CylinderSize.Large, price: 150000 },
  { id: 'mp6', memberId: 'm3', gasType: GasType.Oxygen, size: CylinderSize.Large, price: 165000 },
];

export const MOCK_REFILL_PRICES: RefillPrice[] = [
  { id: 'rp1', stationId: 'rs1', gasType: GasType.Oxygen, size: CylinderSize.Large, price: 50000 },
  { id: 'rp2', stationId: 'rs1', gasType: GasType.Oxygen, size: CylinderSize.Medium, price: 35000 },
  { id: 'rp3', stationId: 'rs2', gasType: GasType.Oxygen, size: CylinderSize.Large, price: 55000 }, // Slightly more expensive
];

// Fallback prices in IDR
export const DEFAULT_PRICES: Record<GasType, Record<CylinderSize, number>> = {
    [GasType.Oxygen]: { [CylinderSize.Small]: 75000, [CylinderSize.Medium]: 150000, [CylinderSize.Large]: 225000 },
    [GasType.Acetylene]: { [CylinderSize.Small]: 150000, [CylinderSize.Medium]: 300000, [CylinderSize.Large]: 450000 },
    [GasType.Argon]: { [CylinderSize.Small]: 180000, [CylinderSize.Medium]: 375000, [CylinderSize.Large]: 600000 },
    [GasType.CO2]: { [CylinderSize.Small]: 120000, [CylinderSize.Medium]: 225000, [CylinderSize.Large]: 330000 },
    [GasType.Nitrogen]: { [CylinderSize.Small]: 90000, [CylinderSize.Medium]: 180000, [CylinderSize.Large]: 270000 },
};
