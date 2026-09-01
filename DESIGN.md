# Oxygne Cylinder - System Architecture & Design Document

**Last Updated:** August 18, 2025  
**Project Name:** Sistem Manajemen Oksigen (Gas Cylinder Management System)  
**Language:** Bahasa Indonesia (UI) | English (Code)  
**Stack:** React 18 + TypeScript + Vite + Supabase  

---

## 📋 Table of Contents

1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Core Business Entities](#core-business-entities)
4. [Main Features](#main-features)
5. [Technology Stack](#technology-stack)
6. [Data Flow](#data-flow)
7. [Key Design Patterns](#key-design-patterns)
8. [Security Model](#security-model)

---

## Project Overview

**Purpose:**  
Aplikasi web untuk mengelola inventory gas cylinder (tabung oksigen, asetilena, argon, dll) dengan sistem rental, tracking, dan financial reporting yang terintegrasi.

**Key Stakeholders:**
- **Admin:** Kelola pengguna, master data, laporan finansial
- **Operator:** Input transaksi, manage inventory, process rental
- **Viewer:** Read-only access untuk laporan

**Business Model:**
- Rental-based (menyewa tabung ke pelanggan dengan deposit)
- Service fees (isi ulang, pengiriman, reparasi)
- Multi-gas-type support dengan pricing flexibility
- Credit system (bon/utang) untuk pelanggan tertentu

---

## Architecture

### High-Level Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    BROWSER (React)                          │
│  ┌───────────────────────────────────────────────────────┐  │
│  │              Components (TSX)                         │  │
│  │  ├─ Layout (Main navigation, auth check)            │  │
│  │  ├─ Dashboard (Home, statistics)                    │  │
│  │  ├─ InventoryView (Cylinder tracking)              │  │
│  │  ├─ MembersView (Customer management)              │  │
│  │  ├─ RentalForm / RefillView (Transactions)        │  │
│  │  ├─ ReportsView (Financial & operational reports) │  │
│  │  ├─ AdminView (User & master data management)     │  │
│  │  └─ [Other domain-specific views]                 │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Business Logic (lib/*.ts)                   │  │
│  │  ├─ Supabase client & data fetching                  │  │
│  │  ├─ Domain logic (beranda, bon, antrian, laporan)  │  │
│  │  ├─ User roles & permissions                        │  │
│  │  └─ Utility functions                               │  │
│  └───────────────────────────────────────────────────────┘  │
│  ┌───────────────────────────────────────────────────────┐  │
│  │           Constants & Labels (labels.ts)             │  │
│  │  ├─ Status translations (Indonesian)                 │  │
│  │  ├─ Transaction type labels                          │  │
│  │  └─ Other UI text constants                          │  │
│  └───────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
                           ↓
                    Supabase API
                           ↓
┌─────────────────────────────────────────────────────────────┐
│                    PostgreSQL Database                      │
│  ├─ profiles (users, roles, permissions)                   │
│  ├─ cylinders (inventory, status, location)               │
│  ├─ members (customers, deposits, debt)                   │
│  ├─ transactions (financial records)                       │
│  ├─ gas_prices (pricing matrix)                           │
│  ├─ rental_tariffs (rental rates)                         │
│  ├─ refill_stations (supplier management)                 │
│  ├─ refill_prices (cost matrix)                           │
│  ├─ refill_drafts (pending refill orders)                │
│  └─ [Other domain tables]                                  │
└─────────────────────────────────────────────────────────────┘
```

### Folder Structure

```
oxygne-cylinder/
├── .claude/                    # Claude Code workspace
│   ├── launch.json            # Dev server config
│   ├── settings.local.json    # Permissions & tools
│   └── worktrees/             # Isolated branches for features
├── components/                 # React components (TSX)
│   ├── Layout.tsx             # Main layout wrapper
│   ├── Login.tsx              # Authentication
│   ├── Dashboard.tsx          # Home page
│   ├── InventoryView.tsx      # Cylinder management
│   ├── MembersView.tsx        # Customer management
│   ├── RentalForm.tsx         # Rental transactions
│   ├── RefillView.tsx         # Refill tracking
│   ├── ReportsView.tsx        # Financial reports
│   ├── ReportView.tsx         # Laporan harian (daily report)
│   ├── AdminView.tsx          # Admin dashboard
│   ├── HistoryView.tsx        # Transaction history
│   ├── MasterDataView.tsx     # Master data (gas types, sizes, etc)
│   ├── KasView.tsx            # Keuangan (finance/cash management)
│   ├── BonView.tsx            # Bon (credit/payment tracking)
│   ├── AntrianIsiView.tsx     # Antrian Isi (refill queue)
│   ├── GasExchangeView.tsx    # Gas exchange service
│   └── [...other views]
├── lib/                        # Business logic & utilities
│   ├── supabase.ts            # Supabase client config
│   ├── beranda.ts             # Dashboard/home logic
│   ├── bon.ts                 # Credit/bon management
│   ├── antrianIsi.ts          # Refill queue logic
│   ├── laporanHarian.ts       # Daily report generation
│   ├── metodeBayar.ts         # Payment method tracking
│   ├── pengeluaran.ts         # Expense management
│   ├── peran.ts               # Role-based access control
│   ├── regulator.ts           # Regulator rental logic
│   ├── urutanTabung.ts        # Cylinder ordering/sorting
│   ├── usePaginasi.ts         # Pagination hook
│   ├── cari.ts                # Search utilities
│   ├── bulkStock.ts           # Bulk inventory operations
│   └── [...]
├── services/                   # External service integrations
│   └── [...service files]
├── supabase/                   # Database migrations & schema
│   └── migrations/
├── App.tsx                     # Main app router
├── types.ts                    # TypeScript type definitions
├── constants.ts               # Mock data & constants
├── labels.ts                  # Indonesian translations
├── vite.config.ts             # Vite bundler config
├── tsconfig.json              # TypeScript config
├── package.json               # Dependencies
└── README.md                  # Project README
```

---

## Core Business Entities

### 1. **Cylinder (Tabung)**
```typescript
interface Cylinder {
  id: string;                    // Unique ID
  serialCode: string;            // e.g., "OXY-1001" (1-3 letters + 1-5 digits)
  gasType: GasType;             // Oxygen, Acetylene, Argon, etc.
  size: CylinderSize;           // 1m³, 2m³, or 6m³
  status: CylinderStatus;       // Available, Rented, EmptyRefill, Refilling, Damaged, Delivery, Unknown
  currentHolder?: string;        // Member ID or "RefillStation" (undefined = in warehouse)
  lastLocation: string;         // Free-text location
  heldSince?: string | null;    // Date when cylinder entered current state
}
```

**Status Lifecycle:**
- `Available` → `Rented` (rental order) → `Available` (return)
- `Available` → `EmptyRefill` (marked empty) → `Refilling` (sent to station) → `Available` (returned)
- `Available` → `Damaged` (incident) → [await repair or write-off]
- `Available` → `Delivery` (outgoing shipment) → `Rented` (delivered)
- `Unknown` (legacy tracking issue; not rentable, not counted in stats)

### 2. **Member (Pelanggan)**
```typescript
interface Member {
  id: string;
  name: string;                 // Contact person
  companyName: string;          // Company/workshop name
  address: string;              // Service address
  phone: string;
  totalDeposit: number;         // Security deposit held
  totalDebt: number;            // Outstanding rental debt
  joinDate: string;             // When they joined
  status: MemberStatus;         // Active, Pending Exit, Non Active
  exitRequestDate?: string;     // When they requested to leave
}
```

**Statuses:**
- `Active` — normal rental
- `Pending Exit` — requested departure; still has cylinders/debt to settle
- `Non Active` — former customer

### 3. **Transaction (Transaksi)**
Records financial & operational events. Types include:
- `RENTAL` — rental charge
- `RENTAL_RETURN` — rental period end
- `REFILL` — refill service charge
- `DEPOSIT_PAID` — initial deposit
- `DEPOSIT_RETURN` — refund at exit
- `ORDER_PAYMENT` — prepaid gas order
- `GAS_EXCHANGE` — gas exchange transaction
- `REGULATOR_RENTAL` — regulator rental/sale
- `BON` — credit payment
- `EXPENSE` — operational cost
- (others)

### 4. **Pricing & Tariffs**

**GasPrice** — Base rental rate per gas type + size:
```typescript
interface GasPrice {
  id: string;
  gasType: GasType;      // e.g., Oxygen
  size: CylinderSize;    // e.g., 6m³
  price: number;         // per day or per rental period
}
```

**MemberPrice** — Custom rate override for specific customer:
```typescript
interface MemberPrice {
  id: string;
  memberId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number;         // custom rate (if not set, use GasPrice)
}
```

**RefillPrice** — Cost to refill at supplier:
```typescript
interface RefillPrice {
  id: string;
  stationId: string;
  gasType: GasType;
  size: CylinderSize;
  price: number;         // cost to refill
  serialCode?: string;   // vendor SKU
}
```

**RentalTariff** — Flexible rental rates (daily, weekly, monthly):
```typescript
interface RentalTariff {
  // (similar structure)
}
```

### 5. **Refill Management**

**RefillStation** — Supplier/partner location:
```typescript
interface RefillStation {
  id: string;
  name: string;
  address: string;
  contactPerson: string;
  phone: string;
}
```

**RefillDraft** — Work-in-progress refill order:
```typescript
interface RefillDraft {
  stationId: string;             // Which station to refill from
  cylinderIds: string[];         // Cylinders to send
  updatedAt: string;             // Last modified
  updatedBy?: string;            // Who modified
}
```

**RefillHistory** — Record of refill operations (implied):
- Tracks cylinder status changes
- Links to transactions for cost

---

## Main Features

### 1. **Inventory Management** (InventoryView)
- View all cylinders with status filtering
- Track location & current holder
- Bulk operations (mark damaged, send to refill, etc.)
- Cylinder search by serial code

### 2. **Rental System** (RentalForm, AntrianIsiView)
- New rental order (pick cylinders, customer, duration)
- Rental queue tracking
- Payment at order (upfront), on delivery, or later (bon)
- Automatic return scheduling
- Regulator rental/sale integration

### 3. **Refill Management** (RefillView)
- Draft refill orders per station
- Cylinder status tracking (Empty → Refilling → Available)
- Cost calculation & billing to supplier
- Bulk delivery tracking

### 4. **Financial Management** (KasView, BonView, ReportsView)
- **Keuangan (Finance Tab):**
  - Deposit tracking (held, returned)
  - Expense categorization
  - Cash vs. transfer payment tracking
  - Daily income/expense summary
- **Bon (Credit Management):**
  - Track unpaid rental/service charges
  - Payment history
  - Admin ability to delete incorrect bon entries
- **Laporan Harian (Daily Report):**
  - Daily income breakdown by payment method
  - Gas exchange revenue
  - Regulator rental income
  - Expense summary
  - Outstanding bon tracking

### 5. **Customer Management** (MembersView)
- Add/edit member details
- Deposit & debt tracking
- Exit request processing
- Credit term customization

### 6. **Admin Functions** (AdminView)
- User management (CRUD)
- Role assignment (Admin, Operator, Viewer)
- Master data: gas types, sizes, tariffs, pricing
- Audit/history view

### 7. **Reporting** (ReportsView)
- Daily financial summary
- Cylinder utilization
- Customer payment status
- Gas exchange history
- Regulator rental performance

---

## Technology Stack

### Frontend
- **React 18** — UI library
- **TypeScript** — Type safety
- **Vite** — Build tool & dev server (localhost:5173)
- **React Router 6** — Client-side routing (Hash-based)
- **Tailwind CSS** — Styling
- **Recharts** — Charts/graphs in reports
- **Clsx + Tailwind Merge** — Dynamic class composition

### Backend / Database
- **Supabase** — PostgreSQL + Auth + Realtime
- **Supabase JavaScript Client** — Data fetching

### Authentication
- **Supabase Auth** — Email/password login
- **Session-based** — Stored in Supabase auth.users
- **Trigger: handle_new_user** — Auto-create profile on signup

### Build & Tooling
- **TypeScript 5.2** — Compilation & type checking
- **ESLint** — Code linting
- **PostCSS + Autoprefixer** — CSS processing
- **Google Genai** — AI Studio integration (ChatBot.tsx)

---

## Data Flow

### Typical Rental Flow

```
1. Operator opens RentalForm
   ↓
2. Select member (customer)
   ↓
3. Pick cylinders from available inventory
   ↓
4. Set rental period & rate (uses GasPrice or MemberPrice)
   ↓
5. Choose payment method:
   a) Paid now (PAID) → PAID status, transaction recorded
   b) Paid on delivery (payment modal) → PAID status, transaction recorded
   c) Credit (BON) → UNPAID status, bon record created
   ↓
6. Record rental transaction:
   - type: RENTAL
   - memberId: selected customer
   - cost: calculated rental fee
   - paymentStatus: PAID or UNPAID
   - paymentMethod: (if PAID)
   ↓
7. Update cylinder status:
   - Cylinder.status = Rented
   - Cylinder.currentHolder = memberId
   - Cylinder.heldSince = today
   ↓
8. Member's totalDebt increases (if credit)
   ↓
9. Return rental triggers:
   - Create RENTAL_RETURN transaction
   - If member has credit, pay from debt
   - Update cylinder status → Available
   - Cylinder.currentHolder = undefined
   - Cylinder.heldSince = null
```

### Daily Report Generation

```
1. ReportsView fetches all transactions for date range
2. Filter by date, sum by:
   - Payment method (cash, transfer, credit)
   - Transaction type (rental, refill, gas exchange, etc.)
   - Member (for debt tracking)
3. Calculate totals:
   - Total income (paid only, excludes bon)
   - Total bon (unpaid)
   - Total expenses (categorized)
4. Render summary tables & charts
```

### Refill Queue Flow

```
1. Operator marks cylinders as EmptyRefill
2. Bulk operation sends to RefillView
3. RefillView displays by station (refill_drafts)
4. Operator:
   - Adds cylinders to draft for a station
   - Confirms draft → sends to station
   - Later, receives cylinders back
5. Update cylinder status:
   - EmptyRefill → Refilling → Available
6. Record refill cost transaction
```

---

## Key Design Patterns

### 1. **Schema Mapping (No Migration Lock-In)**
- Database column names stay **English** (e.g., `cylinders.status`)
- Column VALUES stored in English (e.g., `"Available"`, `"Rented"`)
- **Translation layer** (`labels.ts`) maps to Indonesian at render time
- Benefit: UI label changes don't require database migrations

Example:
```typescript
// Database: status = "Available"
// In code: CylinderStatus.Available
// On screen: labels.ts → "Tersedia"
// Change label? → Edit labels.ts only, no migration
```

### 2. **Centralized Data Filtering**
- Filters applied in `supabase.ts:fetchAllRecords()` using `saring` parameter
- Ensures all consumers see consistent data (e.g., exclude cancelled records)
- Example: `saring = (q) => q.neq('status', 'Cancelled')`
- Benefit: One place to fix filtering logic

### 3. **Pagination with Boundary Detection**
- `usePaginasi.ts` hook handles page state & edge detection
- Automatic detection of "last page" (partial results)
- Prevents accidental data loss on boundary pages

### 4. **Transaction Normalization**
```typescript
// All transactions are structured identically:
interface Transaction {
  id: string;
  memberId?: string;           // Not all have customer (e.g., expenses)
  type: TransactionType;       // Enum of all types
  date: string;                // YYYY-MM-DD
  cost: number;                // Always positive; sign implicit in type
  paymentStatus: 'PAID' | 'UNPAID';  // PAID or UNPAID
  paymentMethod?: MetodeBayar; // Cash, transfer, etc. (undefined for bon)
  description: string;
}
```

Benefits:
- Single transaction table handles all financial records
- Queries filtered by type for reports
- Consistent transaction history across the app

### 5. **Role-Based Access Control (RBAC)**
- Stored in `profiles.role` (admin, operator, viewer)
- `lib/peran.ts` exports permission checks
- Example: `bolehKelolaPengguna()` returns true for admin only
- Used in components for conditional rendering (hide/show buttons)

### 6. **Provisional Data Structures (Drafts)**
- `RefillDraft` stores intent, not execution
- During draf: cylinders keep old status, no transaction created
- On confirm: status changes, transactions recorded
- Benefit: Operator can experiment without corrupting data

---

## Security Model

### Authentication
- **Supabase Auth:** Email/password managed by Supabase
- **Session Tokens:** Stored client-side (browser session)
- **RLS Policies:** (Implied) Supabase RLS should prevent direct DB access

### Authorization
- **Role-Based:** Admin, Operator, Viewer
- **Function-level:** `lib/peran.ts` checks permissions
- **Component-level:** Conditional rendering hides unauthorized actions

### Data Isolation
- Users see only their own data (implied via session role)
- No cross-member data leakage via API queries

### Sensitive Fields
- Email stored in `profiles.username` (legacy column name)
- Password stored only in Supabase `auth.users` (never in profiles)
- Deposit/debt calculations transparent (full audit trail in transactions)

---

## Known Issues & Technical Debt

### Current Status (as of Aug 18, 2025)
- Branch: `harden-db-and-track-unknown-cylinders`
- Latest features: Deposit as daily income, regulator rental/sale, expense categorization
- All identified bugs from recent sessions have been fixed

### Areas for Future Improvement
1. **Real-time Updates:** Consider Supabase Realtime for live inventory
2. **Offline Support:** PWA/service worker for offline transaction recording
3. **Notification System:** Email/SMS alerts for pending returns, deliveries
4. **Advanced Reporting:** Export to PDF/Excel, scheduled reports
5. **Mobile App:** Companion app for field operators
6. **Testing:** Unit & integration tests (currently minimal)

---

## Database Overview (High-Level)

See `DATABASE-SCHEMA.md` for detailed schema.

### Main Tables
- `profiles` — Users & roles
- `cylinders` — Inventory
- `members` — Customers & credit
- `transactions` — All financial records
- `gas_prices`, `member_prices`, `refill_prices` — Pricing
- `rental_tariffs` — Rental rate structures
- `refill_stations` — Supplier locations
- `refill_drafts` — Pending refill orders
- (Additional tables for features: bon, antrian, gas_exchange, regulator, etc.)

---

## Development Workflow

### Running Locally
```bash
npm install              # Install dependencies
npm run dev             # Start Vite dev server (http://localhost:5173)
npm run lint            # ESLint check
npm run build           # Production build
```

### Environment Setup
- Requires `.env.local` with:
  - `VITE_SUPABASE_URL`
  - `VITE_SUPABASE_ANON_KEY`
  - `GEMINI_API_KEY` (for ChatBot)

### Database Migrations
- Stored in `supabase/migrations/`
- Run via Supabase CLI or dashboard
- Named by timestamp (e.g., `20260809143000_backfill_cylinder_status.sql`)

---

## Contact & Maintenance

**Project Owner:** Yoko  
**Last Reviewed:** August 18, 2025  
**Status:** Active Development

For architectural decisions, features, or technical questions, refer to this document and the code comments (especially `lib/*.ts` and main component files).
