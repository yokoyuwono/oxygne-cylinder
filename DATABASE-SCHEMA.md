# Database Schema - Oxygne Cylinder

**Project:** Sistem Manajemen Oksigen  
**Database:** Supabase (PostgreSQL)  
**Last Updated:** August 18, 2025  
**Last Migration:** 20260816192000 (or latest)

---

## 📋 Table of Contents

1. [Overview](#overview)
2. [Authentication & Users](#authentication--users)
3. [Core Tables](#core-tables)
4. [Pricing & Tariffs](#pricing--tariffs)
5. [Service Management](#service-management)
6. [Transactions & Financial](#transactions--financial)
7. [Relationships Diagram](#relationships-diagram)
8. [Indexes & Performance](#indexes--performance)
9. [Row Level Security (RLS)](#row-level-security-rls)
10. [Migration Strategy](#migration-strategy)

---

## Overview

### Database Size & Scale
- **Tables:** 13+ (core + feature-specific)
- **Records (estimated):** 
  - cylinders: ~1,500 units
  - members: ~1,300 customers
  - transactions: ~20,000+ records
- **Retention:** All data kept indefinitely (audit trail)

### Key Principles
1. **English column names, English enum values** — avoids schema migration when UI labels change
2. **Translation at render time** — labels.ts does the translation
3. **Financial immutability** — transactions never deleted, only marked cancelled
4. **Normalization for auditability** — every change traceable to a transaction

---

## Authentication & Users

### `auth.users` (Supabase Managed)
Native Supabase authentication table. Not defined in migrations; managed by Supabase.

| Column | Type | Notes |
|--------|------|-------|
| `id` | UUID | Primary key, auto-generated |
| `email` | TEXT | Unique, used for login |
| `encrypted_password` | BYTEA | Hashed password |
| `email_confirmed_at` | TIMESTAMPTZ | Null until verified |
| `created_at` | TIMESTAMPTZ | Registration time |
| `updated_at` | TIMESTAMPTZ | Last password change, etc. |

### `profiles`
Extends `auth.users` with app-specific fields. Auto-created on user signup via trigger.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | UUID | NO | PK, references auth.users(id) on delete cascade |
| `username` | TEXT | YES | **Legacy:** Actually contains email (mapped from auth.users.email) |
| `name` | TEXT | YES | Display name |
| `role` | TEXT | NO | Default: 'operator'. Values: 'admin', 'operator', 'viewer' |
| `lastLogin` | TEXT | YES | ISO timestamp of last login |

**Trigger:** `on_auth_user_created`
```sql
-- When new auth.user created, auto-insert into profiles
insert into profiles (id, username, name, role)
values (new.id, new.email, 'New User', 'operator');
```

**RLS Policy:**
```sql
-- Authenticated users can read all profiles (for RBAC checks)
-- Only own profile can be updated
```

---

## Core Tables

### `members` (Customers / Pelanggan)
Represents a business/person renting cylinders.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK, e.g., "m-uuid" or "m1" |
| `name` | TEXT | YES | Contact person name |
| `companyName` | TEXT | YES | Business/workshop name |
| `address` | TEXT | YES | Service delivery address |
| `phone` | TEXT | YES | Contact phone |
| `ktp` | TEXT | YES | ID card number (for KYC, unique if set) |
| `totalDeposit` | NUMERIC | NO | Security deposit held (Rp) |
| `totalDebt` | NUMERIC | NO | Outstanding rental/service debt (Rp) |
| `joinDate` | TEXT | NO | ISO date when joined (YYYY-MM-DD) |
| `status` | TEXT | NO | Values: 'Active', 'Pending Exit', 'Non Active' |
| `exitRequestDate` | TEXT | YES | ISO date when requested to leave |

**Unique Constraints:**
- `ktp` — unique but nullable (allows multiple null values)

**Indexes:**
- PK: id
- Search: status, joinDate

**Foreign Keys:**
- None inbound from members table itself

### `cylinders` (Inventory / Tabung)
Individual gas cylinders being tracked.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK, e.g., "cyl-uuid" or "c1" |
| `serialCode` | TEXT | NO | Manufacturer code, e.g., "OXY-1001" |
| `gasType` | TEXT | YES | Enum: 'Oxygen', 'Acetylene (C2H2)', 'Argon', 'CO2', 'Nitrogen', etc. |
| `size` | TEXT | YES | Enum: '1m3', '2m3', '6m3' |
| `status` | TEXT | YES | Enum: 'Available', 'Rented', 'Empty (Needs Refill)', 'Refilling', 'Damaged', 'Delivery', 'Unknown' |
| `currentHolder` | TEXT | YES | memberId if rented; 'RefillStation-{id}' if at supplier; empty/null if in warehouse |
| `lastLocation` | TEXT | YES | Free-text location (e.g., "Gudang Utama", "Bengkel ABC") |
| `heldSince` | TEXT | YES | ISO date (YYYY-MM-DD) cylinder entered current state; null if never rented |

**Indexes:**
- PK: id
- Search: serialCode (UNIQUE)
- Filter: status, gasType, currentHolder

**Foreign Keys:**
- `currentHolder` → members(id) (implicit, not enforced as FK for flexibility)

### `refill_stations` (Suppliers / Stasiun Isi)
Third-party refill service providers.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK |
| `name` | TEXT | YES | Station name |
| `address` | TEXT | YES | Service address |
| `contactPerson` | TEXT | YES | Primary contact |
| `phone` | TEXT | YES | Contact phone |

**Indexes:**
- PK: id
- Search: name, phone

---

## Pricing & Tariffs

### `rental_tariffs` (Master Pricing)
Defines rental rates, deposit amounts, and gas prices. Updated via Master Data UI.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK |
| `kind` | TEXT | NO | Enum: 'CYLINDER', 'REGULATOR' |
| `name` | TEXT | YES | Human-readable name (used for REGULATOR) |
| `gasType` | TEXT | YES | Gas type (CYLINDER only; null for REGULATOR) |
| `size` | TEXT | YES | Cylinder size (CYLINDER only; null for REGULATOR) |
| `depositAmount` | NUMERIC | NO | Security deposit required (Rp) |
| `rentalFee` | NUMERIC | NO | Base daily/period rental cost (Rp) |
| `gasPrice` | NUMERIC | NO | Gas refill cost (Rp) |
| `salePrice` | NUMERIC | NO | Sale price for regulator (Rp) |
| `isActive` | BOOLEAN | NO | If false, tariff is draft/inactive |
| `createdAt` | TIMESTAMPTZ | NO | When created |

**Unique Constraints:**
- `(gasType, size)` for CYLINDER entries only
- `kind='REGULATOR'` typically has one active row

**Example Rows:**
```
id          kind      gasType  size  depositAmount rentalFee gasPrice salePrice isActive
rt-oxy-6m3  CYLINDER  Oxygen   6m3   500000        500000    140000   0         true
rt-oxy-1m3  CYLINDER  Oxygen   1m3   250000        250000    50000    0         true
rt-reg-std  REGULATOR NULL     NULL  0             250000    0        400000    true
```

### `member_prices` (Custom Pricing)
Customer-specific overrides for gas/cylinder pricing.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK |
| `memberId` | TEXT | NO | FK → members(id) on delete cascade |
| `gasType` | TEXT | YES | Gas type |
| `size` | TEXT | YES | Cylinder size |
| `price` | NUMERIC | YES | Custom rental rate (overrides rental_tariffs) |

**Foreign Keys:**
- memberId → members(id) [cascade delete]

**Logic:**
- If custom price exists, use it; else fall back to rental_tariffs.rentalFee
- Allows volume discounts per customer

### `refill_prices` (Supplier Pricing)
Cost to refill cylinders at each supplier.

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK |
| `stationId` | TEXT | NO | FK → refill_stations(id) on delete cascade |
| `gasType` | TEXT | YES | Gas type |
| `size` | TEXT | YES | Cylinder size |
| `price` | NUMERIC | YES | Cost to refill (Rp) |
| `serialCode` | TEXT | YES | Supplier's SKU/code |

**Foreign Keys:**
- stationId → refill_stations(id) [cascade delete]

---

## Service Management

### `regulators` (Regulator Inventory)
Individual regulator units (separate from cylinders; can be rented or sold).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `id` | TEXT | NO | PK |
| `code` | TEXT | NO | Unique identifier (e.g., "REG-001") |
| `status` | TEXT | NO | Enum: 'Available', 'Rented', 'Sold', 'Damaged' |
| `currentHolder` | TEXT | YES | memberId if rented; null if in stock |
| `memberId` | TEXT | YES | FK → members(id) on delete set null |
| `notes` | TEXT | YES | Internal notes |
| `createdAt` | TIMESTAMPTZ | NO | When registered |

**Indexes:**
- PK: id
- Unique: code
- Filter: status

**Foreign Keys:**
- memberId → members(id) [set null on delete]

### `refill_drafts` (Pending Refill Orders)
Work-in-progress refill deliveries to suppliers (not finalized yet).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| `stationId` | TEXT | NO | PK/FK → refill_stations(id) |
| `cylinderIds` | TEXT[] | NO | Array of cylinder IDs to send to this station |
| `updatedAt` | TEXT | NO | Last modified time (ISO timestamp) |
| `updatedBy` | TEXT | YES | User ID who last modified |

**Key Behavior:**
- One draft per station (upsert pattern in code)
- Cylinders don't change status during draft (only on confirm)
- No transaction records created until draft is confirmed

---

## Transactions & Financial

### `transactions` (All Financial Records)
Unified table for every financial event (rental, payment, expense, etc.).

| Column | Type | Nullable | Notes |
|--------|------|----------|-------|
| **Core** | | | |
| `id` | TEXT | NO | PK, e.g., "t-uuid", "t-antri-bayar-{timestamp}" |
| `type` | TEXT | NO | Transaction type (see enum below) |
| `date` | TEXT | NO | ISO date (YYYY-MM-DD) |
| `description` | TEXT | YES | Human-readable summary |
| | | | |
| **Amount** | | | |
| `cost` | NUMERIC | YES | Primary amount (Rp) |
| `depositAmount` | NUMERIC | YES | Security deposit portion (if rental) |
| `rentalFee` | NUMERIC | YES | Rental cost portion (if rental) |
| `gasPrice` | NUMERIC | YES | Gas cost portion (if rental) |
| | | | |
| **Payment** | | | |
| `paymentStatus` | TEXT | YES | 'PAID' or 'UNPAID' (bon/credit) |
| `paymentMethod` | TEXT | YES | 'Cash', 'Transfer', null for bon |
| | | | |
| **Regulator** | | | |
| `regulatorFee` | NUMERIC | YES | Regulator rental cost |
| `regulatorSalePrice` | NUMERIC | YES | Sale price if sold |
| `regulatorId` | TEXT | YES | FK → regulators(id) on delete set null |
| | | | |
| **References** | | | |
| `memberId` | TEXT | YES | FK → members(id) on delete set null |
| `cylinderId` | TEXT | YES | FK → cylinders(id) |
| `refillStationId` | TEXT | YES | FK → refill_stations(id) on delete set null |
| | | | |
| **Meta** | | | |
| `relatedTransactionIds` | TEXT[] | YES | Links to related transactions (e.g., rental → return) |

**Transaction Types:**
```
RENTAL                      -- Rental order placed
RENTAL_RETURN               -- Rental period ended
REFILL                      -- Cylinder refill charge
DEPOSIT_PAID                -- Initial deposit paid
DEPOSIT_RETURN              -- Deposit refunded at exit
ORDER_PAYMENT               -- Gas order prepayment
GAS_EXCHANGE                -- Gas exchange service
REGULATOR_RENTAL            -- Regulator rental charge
REGULATOR_SALE              -- Regulator sold
BON_PAYMENT                 -- Payment of credit/bon
EXPENSE                     -- Operational expense
[Others from lib/antrianIsi.ts, etc.]
```

**Key Patterns:**
1. **cost = total revenue** for that transaction (sum of deposit, rental, gas, regulator)
2. **cost components** broken out in depositAmount, rentalFee, gasPrice, etc. for detailed reporting
3. **paymentStatus:**
   - 'PAID' = money received immediately
   - 'UNPAID' = credit extended (bon); member.totalDebt increases
4. **paymentMethod** only filled if PAID; null for UNPAID (bon doesn't have a "method" yet)

**Indexes:**
- PK: id
- Filter: date, type, memberId, paymentStatus
- Full-text search: description (optional future enhancement)

**Foreign Keys:**
- memberId → members(id) [set null]
- cylinderId → cylinders(id)
- refillStationId → refill_stations(id) [set null]
- regulatorId → regulators(id) [set null]

---

## Relationships Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      auth.users                             │
│                   (Supabase Managed)                        │
└─────────────────────┬───────────────────────────────────────┘
                      │ id (1-to-1)
                      ↓
             ┌────────────────┐
             │   profiles     │ (Users & Roles)
             │  - id (PK)     │
             │  - username    │
             │  - name        │
             │  - role        │
             └────────────────┘


┌─────────────────────────────────────────────────────────────┐
│                      members                                │
│              (Customers / Pelanggan)                        │
│  - id (PK)                                                  │
│  - name, companyName, address, phone                        │
│  - totalDeposit, totalDebt                                  │
│  - status (Active, Pending Exit, Non Active)               │
└──────────┬──────────────────────────────────────────────────┘
           │ memberId (1-to-many)
           │
    ┌──────┴──────┐
    │             │
    ↓             ↓
┌─────────┐  ┌──────────────┐
│ member  │  │ transactions │ (1-to-many)
│ _prices │  │              │
└─────────┘  └──────────────┘


┌─────────────────────────────────────────────────────────────┐
│                    cylinders                                │
│                 (Inventory)                                 │
│  - id (PK)                                                  │
│  - serialCode, gasType, size                               │
│  - status (Available, Rented, etc.)                        │
│  - currentHolder (points to member or warehouse)           │
└──────────┬──────────────────────────────────────────────────┘
           │ cylinderId (1-to-many)
           │
           ↓
    ┌──────────────┐
    │ transactions │ (1-to-many)
    └──────────────┘


┌──────────────────────────────────────────────────────────────┐
│                  refill_stations                             │
│                 (Suppliers)                                  │
│  - id (PK)                                                   │
│  - name, address, contactPerson, phone                       │
└──────┬───────────────────────────────────────────────────────┘
       │ stationId (1-to-many)
       │
    ┌──┴───────┐
    │          │
    ↓          ↓
┌──────────┐  ┌────────────────┐
│ refill   │  │ refill_drafts  │
│ _prices  │  │ (work in prog) │
└──────────┘  └────────────────┘


┌──────────────────────────────────────────────────────────────┐
│              rental_tariffs                                  │
│          (Master Pricing)                                    │
│  - id (PK)                                                   │
│  - kind (CYLINDER or REGULATOR)                             │
│  - gasType, size (for CYLINDER)                            │
│  - depositAmount, rentalFee, gasPrice, salePrice          │
└──────────────────────────────────────────────────────────────┘


┌──────────────────────────────────────────────────────────────┐
│                 regulators                                   │
│             (Regulator Inventory)                            │
│  - id (PK)                                                   │
│  - code, status                                             │
│  - memberId (if rented)                                    │
└──────┬───────────────────────────────────────────────────────┘
       │ regulatorId (1-to-many)
       │
       ↓
    ┌──────────────┐
    │ transactions │ (for rental/sale tracking)
    └──────────────┘
```

---

## Indexes & Performance

### Primary Indexes (Present)
```sql
-- Members
members.id                 (PK)
members.status            (Filter for Active, Pending Exit)

-- Cylinders
cylinders.id              (PK)
cylinders.serialCode      (Search by code)
cylinders.status          (Filter by status)

-- Transactions
transactions.id           (PK)
transactions.date         (Filter by date range)
transactions.type         (Filter by type)
transactions.memberId     (Join with members)

-- Regulators
regulators.id             (PK)
regulators.code           (Unique, search)
regulators.status         (Filter by status)

-- Rental Tariffs
rental_tariffs.id         (PK)
rental_tariffs.gasType + rental_tariffs.size  (Unique for CYLINDER)
```

### Recommended Additional Indexes (Performance)
```sql
-- High-volume queries in Daily Reports
CREATE INDEX transactions_date_type_idx 
  ON transactions (date, type);

CREATE INDEX transactions_date_paymentstatus_idx 
  ON transactions (date, paymentStatus);

-- Member debt queries
CREATE INDEX members_status_totaldebt_idx 
  ON members (status) WHERE totalDebt > 0;

-- Cylinder availability
CREATE INDEX cylinders_status_gastype_size_idx 
  ON cylinders (status, gasType, size);
```

### Query Patterns
```sql
-- Daily report (frequent, complex)
SELECT 
  type, 
  SUM(cost) as total, 
  paymentMethod
FROM transactions
WHERE date = '2025-08-18' 
  AND paymentStatus = 'PAID'
GROUP BY type, paymentMethod;

-- Cylinder utilization
SELECT 
  status, 
  COUNT(*) as count,
  gasType,
  size
FROM cylinders
WHERE status != 'Unknown'
GROUP BY status, gasType, size;

-- Member outstanding debt
SELECT id, name, totalDebt
FROM members
WHERE status = 'Active' AND totalDebt > 0
ORDER BY totalDebt DESC;
```

---

## Row Level Security (RLS)

### Policy Overview
All tables have RLS enabled. Policies differentiate by user role.

### Current Policies (as of latest migration)
```sql
-- All authenticated users can access all data
-- (implies RBAC is handled in app code, not database)

ALTER TABLE members 
  ENABLE ROW LEVEL SECURITY;

CREATE POLICY authenticated_full_access ON members
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Same for: cylinders, transactions, profiles, refill_stations, 
--          rental_tariffs, regulators, refill_prices, member_prices
```

### Future Enhancement
Consider per-role policies:
- **Admin:** Full read/write all tables
- **Operator:** Read all; write only to transactions and cylinders
- **Viewer:** Read-only all tables

---

## Migration Strategy

### Migration File Naming
```
YYYYMMDDHHMMSS_description.sql
Example: 20260812090000_batalkan_transaksi.sql
```

### Migration Execution
1. Stored in `supabase/migrations/` folder
2. Run via Supabase CLI: `supabase db push`
3. Timestamp ensures order; older migrations applied first

### Testing Migrations
```bash
# Test in local Postgres first
psql -U postgres -d oxygne_test < supabase/migrations/20260812090000_*.sql

# Then push to Supabase staging
supabase db push --db-url="postgresql://..."
```

### Rollback Strategy
- **Forward-only:** No rollback functions in migrations
- **Recovery:** Via backup database
- **Avoid:** Data-destructive operations; always use ADD/ALTER, not DROP

### Recent Migrations (Last 5)
1. **20260816192000** (implied latest) — Latest schema state
2. **20260813080000** — Gabung tabung ganda (merge duplicates)
3. **20260812190000** — Selaraskan penuh dengan opname (reconcile inventory)
4. **20260812090000** — Batalkan transaksi (cancel transactions)
5. **20260811103000** — Catat pengeluaran (expense tracking)

---

## Data Dictionary Quick Reference

| Table | Purpose | Key Columns | Typical Rows |
|-------|---------|-------------|--------------|
| `profiles` | Users & roles | id, email, role | ~20 |
| `members` | Customers | id, name, totalDeposit, totalDebt | ~1,300 |
| `cylinders` | Inventory | id, gasType, size, status, currentHolder | ~1,500 |
| `transactions` | Financial records | id, type, date, cost, memberId, paymentStatus | ~20,000 |
| `rental_tariffs` | Pricing matrix | kind, gasType, size, rentalFee, gasPrice | ~6-10 |
| `member_prices` | Custom pricing | memberId, gasType, size, price | ~50-200 |
| `refill_prices` | Supplier costs | stationId, gasType, size, price | ~20-50 |
| `regulators` | Regulator stock | id, code, status, memberId | ~50-100 |
| `refill_stations` | Suppliers | id, name, phone | ~5-10 |
| `refill_drafts` | WIP refills | stationId, cylinderIds | ~5-10 |

---

## Contact & Maintenance

**Database Admin:** Supabase Dashboard  
**Backup Location:** Supabase automated backups + manual export to OneDrive  
**Last Reviewed:** August 18, 2025

For schema changes, migrations, or queries:
1. Review existing migration files for patterns
2. Write new migration with clear comments
3. Test in development environment
4. Refer to DESIGN.md for business logic context
