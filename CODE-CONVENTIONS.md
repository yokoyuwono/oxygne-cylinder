# Code Conventions - Oxygne Cylinder

**Project:** Sistem Manajemen Oksigen (oxygne-cylinder)  
**Language:** TypeScript + React  
**Last Updated:** August 18, 2025  

---

## 📋 Table of Contents

1. [Naming Conventions](#naming-conventions)
2. [Code Structure & Formatting](#code-structure--formatting)
3. [Type Definitions](#type-definitions)
4. [React Component Patterns](#react-component-patterns)
5. [Business Logic (lib/)](#business-logic-lib)
6. [Translations & Labels](#translations--labels)
7. [Imports & Module Organization](#imports--module-organization)
8. [Comments & Documentation](#comments--documentation)
9. [Error Handling](#error-handling)
10. [Testing Expectations](#testing-expectations)

---

## Naming Conventions

### Files & Folders
- **Components:** PascalCase, .tsx extension
  - ✅ `Dashboard.tsx`, `RentalForm.tsx`, `MembersView.tsx`
  - ❌ `dashboard.tsx`, `rentalForm.tsx`
- **Library files:** camelCase, .ts extension
  - ✅ `beranda.ts`, `laporanHarian.ts`, `peran.ts`
  - ❌ `Beranda.ts`, `laporan_harian.ts`
- **Type files:** types.ts (centralized)
- **Utility/constants:** constants.ts, labels.ts

### Variables & Functions
- **Constants (exported):** SCREAMING_SNAKE_CASE
  ```typescript
  export const MOCK_USERS: AppUser[] = [...];
  export const STATUS_TABUNG: Record<CylinderStatus, string> = {...};
  ```
- **Variables (local):** camelCase
  ```typescript
  const userData = await fetchUser(id);
  let isLoading = false;
  ```
- **Booleans:** Prefix with is/has/should/can
  ```typescript
  const isSupabaseConfigured = !!supabaseUrl && !!supabaseKey;
  const hasPermission = bolehKelolaPengguna(user.role);
  const shouldShowBon = transaction.paymentStatus === 'UNPAID';
  ```
- **Functions:** camelCase, verb-first when action-oriented
  ```typescript
  const fetchAllRecords = async (...) => { ... }
  const keAppUser = (baris: BarisProfil): AppUser => { ... }
  const bolehKelolaPengguna = (role: UserRole): boolean => { ... }
  ```
- **React Hooks:** camelCase, prefix with 'use'
  ```typescript
  const usePaginasi = (initialPage = 1) => { ... }
  ```

### Database & Domain Names
- **Table names:** snake_case (PostgreSQL convention)
  - `cylinders`, `members`, `transactions`, `refill_stations`, `refill_drafts`
- **Column names:** snake_case
  - `created_at`, `updated_by`, `serial_code`, `gas_type`
- **Enum values (in DB):** English, PascalCase when stored
  ```typescript
  // Column value: "Available", "Rented", "EmptyRefill"
  // NOT: "available", "rented", "empty_refill"
  ```
- **Indonesian business terms:** camelCase in code
  ```typescript
  interface GasOrder { /* ... */ }       // Not GasOrderan
  const laporanHarian = { /* ... */ }    // Not laporan_harian
  const barisBayarPesanan = { /* ... */ } // Mixed Indonesian, camelCase
  ```

---

## Code Structure & Formatting

### Indentation
- **Spaces:** 2 spaces (NOT tabs, NOT 4 spaces)
  ```typescript
  export const MOCK_MEMBERS: Member[] = [
    { 
      id: 'm1', 
      name: 'Budi Santoso', 
      companyName: 'Bengkel Maju Jaya',
      // ...
    },
  ];
  ```

### Line Length
- **Aim for:** 80-100 characters max
- **Hard limit:** 120 characters (avoid exceeding)
- Use line breaks intelligently for readability

### Import Organization
1. React & external libraries (react, react-router, etc.)
2. Type definitions (from ./types)
3. Library functions (from ./lib)
4. Constants & labels (from ./constants, ./labels)
5. Other local imports

```typescript
import React, { useState, useEffect } from 'react';
import { Cylinder, Member, GasType } from './types';
import { bolehKelolaPengguna, tarifRegulatorAktif } from './lib/peran';
import { STATUS_TABUNG, JENIS_TRANSAKSI } from './labels';
import { MOCK_CYLINDERS } from './constants';
```

### Spacing
- Blank line between imports and code
- Blank line between function definitions
- No excessive blank lines (max 1 between sections)

---

## Type Definitions

### Location
- **All types:** Centralized in `types.ts`
- Never define types inside components (except inline interface for local props)

### Enum Pattern
```typescript
export enum GasType {
  Oxygen = 'Oxygen',
  Acetylene = 'Acetylene (C2H2)',
  Argon = 'Argon',
  // ... (values are strings, used as-is in DB)
}

export enum CylinderStatus {
  Available = 'Available',
  Rented = 'Rented',
  EmptyRefill = 'Empty (Needs Refill)',
  // ... (storage value differs from display label)
}
```

**Key principle:** Enum VALUE is what's stored in DB (English, no spaces or underscores). Display translation happens in `labels.ts`.

### Interface Pattern
```typescript
export interface Cylinder {
  id: string;                    // Always include id
  serialCode: string;            // 1-3 letters + 1-5 digits
  gasType: GasType;              // Use enums for fixed values
  size: CylinderSize;
  status: CylinderStatus;
  currentHolder?: string;        // Optional fields use ?
  lastLocation: string;
  heldSince?: string | null;     // null = never set, undefined = optional
}
```

### Comments on Types
```typescript
/**
 * Baris tabel profiles apa adanya.
 *
 * Kolomnya bernama `username` tapi isinya email -- trigger handle_new_user
 * mengisinya dari auth.users.email. Nama kolomnya dibiarkan supaya tidak perlu
 * migration; yang dipetakan cuma bentuknya saat masuk ke app.
 */
interface BarisProfil {
  id: string;
  username: string | null;  // Actually email, see comment above
  name: string | null;
  role: string | null;
}
```

---

## React Component Patterns

### Component Structure
```typescript
import React, { useState, useEffect } from 'react';
import { Cylinder, Member } from '../types';
import { fetchCylinders } from '../lib/inventory';

/**
 * Brief description of what this component does.
 * 
 * Mentions of key interactions, side effects, or non-obvious behavior.
 */
interface InventoryViewProps {
  memberId?: string;
  onSelect?: (cylinder: Cylinder) => void;
}

const InventoryView: React.FC<InventoryViewProps> = ({ 
  memberId, 
  onSelect 
}) => {
  // --- State ---
  const [cylinders, setCylinders] = useState<Cylinder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // --- Effects ---
  useEffect(() => {
    const load = async () => {
      try {
        setIsLoading(true);
        const data = await fetchCylinders();
        setCylinders(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setIsLoading(false);
      }
    };

    load();
  }, []);

  // --- Handlers ---
  const handleSelect = (cylinder: Cylinder) => {
    onSelect?.(cylinder);
  };

  // --- Render ---
  if (isLoading) return <div>Loading...</div>;
  if (error) return <div className="text-red-500">{error}</div>;

  return (
    <div className="space-y-4">
      {cylinders.map((cyl) => (
        <div key={cyl.id} onClick={() => handleSelect(cyl)}>
          {/* Render cylinder */}
        </div>
      ))}
    </div>
  );
};

export default InventoryView;
```

### Component Naming
- Suffix with domain: `DashboardView`, `InventoryView`, `MembersView`, `ReportsView`
- Exception: Generic components (Layout, Button, Paginasi) — no View suffix
- Always export as default at bottom

### Props Pattern
```typescript
// Define props interface separately
interface DashboardProps {
  userId: string;
  onLogout?: () => void;
}

// Use React.FC with props
const Dashboard: React.FC<DashboardProps> = ({ userId, onLogout }) => { ... }
```

### Conditional Rendering
```typescript
// Simple true/false
{isLoading && <Spinner />}

// Complex with classes
<div className={`
  px-4 py-2 rounded
  ${isSelected ? 'bg-blue-500 text-white' : 'bg-gray-100'}
  ${isDisabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}
`}>

// Use clsx/classnames for complex conditions
<div className={clsx(
  'px-4 py-2 rounded',
  isSelected && 'bg-blue-500 text-white',
  isDisabled && 'opacity-50 cursor-not-allowed'
)}>
```

---

## Business Logic (lib/)

### File Organization
Each `lib/*.ts` file handles one domain:
- `beranda.ts` — Dashboard calculations
- `bon.ts` — Credit/bon management
- `antrianIsi.ts` — Refill queue logic
- `laporanHarian.ts` — Daily report generation
- `peran.ts` — Role-based permissions
- `metodeBayar.ts` — Payment method tracking
- `pengeluaran.ts` — Expense management

### Function Pattern
```typescript
/**
 * Calculates total daily income from all transactions.
 * 
 * Filters out unpaid transactions (bon) unless includeBon is true.
 * Breaks down by payment method for reconciliation.
 * 
 * @param transactions All transactions for the day
 * @param includeBon If true, include unpaid transactions in total
 * @returns Object with total and breakdown by method
 */
export const hitungPendapatanHarian = (
  transactions: Transaction[],
  includeBon: boolean = false
): { total: number; byMethod: Record<string, number> } => {
  const byMethod: Record<string, number> = {};
  
  const filtered = includeBon 
    ? transactions 
    : transactions.filter((t) => t.paymentStatus === 'PAID');

  filtered.forEach((t) => {
    const method = t.paymentMethod || 'Belum Dibayar';
    byMethod[method] = (byMethod[method] || 0) + t.cost;
  });

  return {
    total: Object.values(byMethod).reduce((a, b) => a + b, 0),
    byMethod,
  };
};
```

### Data Fetching Pattern
```typescript
export const fetchCylindersWithStatus = async (
  status: CylinderStatus
): Promise<Cylinder[]> => {
  try {
    const { data, error } = await supabase
      .from('cylinders')
      .select('*')
      .eq('status', status);

    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error(`Failed to fetch cylinders:`, err);
    throw err;  // Let caller handle
  }
};
```

### Transformation Functions
Keep transformations pure (no side effects):
```typescript
// Pure transformation
const keAppUser = (baris: BarisProfil): AppUser => ({
  id: baris.id,
  email: baris.username || '',  // Map column name
  name: baris.name || 'Tanpa Nama',
  role: (baris.role as UserRole) || UserRole.Operator,
  lastLogin: baris.lastLogin || undefined,
});
```

---

## Translations & Labels

### Pattern in labels.ts
```typescript
import { CylinderStatus, MemberStatus, UserRole } from './types';

/**
 * Peta label bahasa Indonesia untuk nilai-nilai yang tersimpan di database.
 *
 * Nilai di kolom seperti cylinders.status dan members.status sengaja dibiarkan
 * berbahasa Inggris supaya perubahan tampilan tidak pernah menuntut migrasi data
 * pada ribuan baris produksi. Terjemahannya dilakukan di sini, saat dirender.
 */

export const STATUS_TABUNG: Record<CylinderStatus, string> = {
  [CylinderStatus.Available]: 'Tersedia',
  [CylinderStatus.Rented]: 'Disewa',
  [CylinderStatus.EmptyRefill]: 'Kosong (Perlu Isi Ulang)',
  [CylinderStatus.Refilling]: 'Sedang Diisi',
  [CylinderStatus.Damaged]: 'Rusak',
  [CylinderStatus.Delivery]: 'Pengiriman',
  [CylinderStatus.Unknown]: 'Tidak Diketahui',
};

export const STATUS_ANGGOTA: Record<MemberStatus, string> = {
  [MemberStatus.Active]: 'Aktif',
  [MemberStatus.Pending_Exit]: 'Menunggu Keluar',
  [MemberStatus.Non_Active]: 'Tidak Aktif',
};

export const JENIS_TRANSAKSI: Record<string, string> = {
  RENTAL: 'Sewa Tabung',
  RENTAL_RETURN: 'Pengembalian Sewa',
  REFILL: 'Isi Ulang',
  DEPOSIT_PAID: 'Deposit Dibayar',
  // ... (all transaction types)
};
```

### Usage in Components
```typescript
import { STATUS_TABUNG, JENIS_TRANSAKSI } from './labels';

<span>{STATUS_TABUNG[cylinder.status]}</span>
<td>{JENIS_TRANSAKSI[transaction.type] || transaction.type}</td>
```

### Adding New Translations
1. Add to enum/type in `types.ts` if needed
2. Add label mapping to `labels.ts`
3. Use in components with Record lookup

---

## Imports & Module Organization

### Clean Import Pattern
```typescript
// ✅ Good
import { STATUS_TABUNG } from './labels';
import { bolehKelolaPengguna } from './lib/peran';
import { Cylinder, CylinderStatus } from './types';

// ❌ Avoid
import * from './labels';
import * as labels from './labels';
import STATUS_TABUNG from './labels';  // Default export not used
```

### Circular Dependency Prevention
- `types.ts` — Never imports from other files (base layer)
- `lib/*.ts` — Can import from types, constants, labels
- `components/*.tsx` — Can import from types, lib, constants, labels
- Avoid: component A → lib → component B

### Path Aliases (if configured)
Currently using relative paths. If path aliases added (e.g., `@/lib`):
```typescript
import { bolehKelolaPengguna } from '@/lib/peran';
import { Cylinder } from '@/types';
```

---

## Comments & Documentation

### Comment Style

**JSDoc for exported functions:**
```typescript
/**
 * Calculates rental cost based on cylinder size, gas type, and duration.
 * 
 * Applies member-specific pricing if available; falls back to base price.
 * Handles both daily and weekly rates depending on duration.
 * 
 * @param cylinder The cylinder being rented
 * @param member The customer
 * @param daysRented Number of days
 * @returns Calculated cost
 * @throws Error if no pricing found for this combination
 */
export const hitungBiayaSewa = (
  cylinder: Cylinder,
  member: Member,
  daysRented: number
): number => { ... }
```

**Inline comments for non-obvious logic:**
```typescript
// Filter out unknown cylinders (legacy tracking issues)
const rentable = cylinders.filter(c => c.status !== CylinderStatus.Unknown);

// Bon pesanan diperlakukan sama dengan sewa kredit: tetap terhitung pemasukan
// hari itu, tapi masuk kelompok "Belum Dibayar" di rekap metode bayar.
const paymentStatus = bayar.bon ? 'UNPAID' : 'PAID';
```

**Comments on confusing column names:**
```typescript
interface BarisProfil {
  username: string | null;  // Actually email (legacy column name); mapped to email field
}
```

### Documentation Style
- Use Bahasa Indonesia for business logic explanations
- Use English for technical implementation details
- Be concise; avoid redundancy with obvious code

---

## Error Handling

### Try-Catch Pattern
```typescript
export const fetchAllRecords = async <T>(...): Promise<T[]> => {
  try {
    const { data, error } = await supabase
      .from(tableName)
      .select(select);

    if (error) throw error;  // Supabase error
    return data || [];
  } catch (err) {
    console.error(`Error fetching from ${tableName}:`, err);
    throw err;  // Re-throw for caller to handle
  }
};
```

### Component Error State
```typescript
const [error, setError] = useState<string | null>(null);

useEffect(() => {
  const load = async () => {
    try {
      const data = await fetchData();
      // process
    } catch (err) {
      setError(
        err instanceof Error 
          ? err.message 
          : 'Terjadi kesalahan yang tidak diketahui'
      );
    }
  };
  load();
}, []);

if (error) {
  return <div className="text-red-600 p-4">{error}</div>;
}
```

---

## Testing Expectations

### Unit Test Pattern (if/when added)
```typescript
// Example structure (currently no tests, but keep in mind for future)
describe('hitungBiayaSewa', () => {
  it('should apply member-specific pricing if available', () => {
    // Arrange
    const cylinder = { gasType: GasType.Oxygen, size: CylinderSize.Large };
    const member = { id: 'm1', /* ... */ };
    const daysRented = 5;

    // Act
    const cost = hitungBiayaSewa(cylinder, member, daysRented);

    // Assert
    expect(cost).toBeGreaterThan(0);
  });
});
```

### Component Test Pattern
```typescript
// Example structure
describe('RentalForm', () => {
  it('should render form fields for customer selection', () => {
    render(<RentalForm />);
    expect(screen.getByLabelText(/Pilih Pelanggan/i)).toBeInTheDocument();
  });
});
```

---

## Quick Reference

| Aspect | Convention |
|--------|------------|
| Files | PascalCase (.tsx), camelCase (.ts) |
| Indentation | 2 spaces |
| Variables | camelCase |
| Constants | SCREAMING_SNAKE_CASE |
| Booleans | is/has/should prefix |
| Enums | PascalCase values, English words only |
| Database | snake_case columns, English enum values |
| Components | PascalCase, Domain + View suffix |
| Translations | labels.ts Record<Enum, string> |
| Comments | JSDoc for exports, inline for clarity |
| Imports | Top of file, organized by layer |

---

## Updating This Document

When you discover a convention not listed here:
1. Codify it in this document
2. If it contradicts existing code, discuss with team
3. Apply consistently going forward

Last updated: August 18, 2025
