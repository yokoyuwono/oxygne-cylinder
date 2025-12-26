
export enum GasType {
  Oxygen = 'Oxygen',
  Acetylene = 'Acetylene (C2H2)',
  Argon = 'Argon',
  CO2 = 'CO2',
  Nitrogen = 'Nitrogen',
}

export enum CylinderStatus {
  Available = 'Available',
  Rented = 'Rented',
  EmptyRefill = 'Empty (Needs Refill)',
  Refilling = 'Refilling',
  Damaged = 'Damaged',
}

export enum CylinderSize {
  Small = '1m3',
  Medium = '2m3',
  Large = '6m3',
}

export enum UserRole {
  Admin = 'admin',
  Operator = 'operator',
  Viewer = 'viewer'
}

export enum MemberStatus {
  Active = 'Active',
  Pending_Exit = 'Pending Exit',
  Non_Active = 'Non Active'
}

export interface AppUser {
  id: string;
  username: string;
  password?: string; // Optional for UI display, required for auth logic
  name: string;
  role: UserRole;
  lastLogin?: string;
}

export interface Cylinder {
  id: string;
  serialCode: string; // 1-3 letters + 1-5 digits
  gasType: GasType;
  size: CylinderSize;
  status: CylinderStatus;
  currentHolder?: string; // Member ID or 'RefillStation'
  lastLocation: string;
}

export interface Member {
  id: string;
  name: string;
  companyName: string;
  address: string; // Changed from email
  phone: string;
  totalDeposit: number; // Security deposit held
  totalDebt: number; // Outstanding rental debt
  joinDate: string;
  status: MemberStatus;
  exitRequestDate?: string; // Date when they requested to leave
}

export interface RefillStation {
  id: string;
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
}

export interface MemberPrice {
  id: string;
  memberId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number; // Custom rate for this specific combination
}

export interface RefillPrice {
  id: string;
  stationId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number; // Cost to refill at this station
}

export interface Transaction {
  id: string;
  cylinderId?: string; // Optional for DEBT_PAYMENT
  memberId?: string;
  refillStationId?: string; // For refill transactions
  type: 'RENTAL_OUT' | 'RETURN' | 'REFILL_OUT' | 'REFILL_IN' | 'DEBT_PAYMENT' | 'DEPOSIT_REFUND';
  date: string;
  rentalDuration?: number; // Days held (relevant for RETURN type)
  cost?: number; // Cost of refill or rental
  paymentStatus?: 'PAID' | 'UNPAID';
  relatedTransactionIds?: string[]; // IDs of transactions paid by this DEBT_PAYMENT
}

// Chat types
export interface ChatMessage {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: Date;
}
