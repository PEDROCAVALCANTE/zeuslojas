# Security Specification - ZEUS Multi-Tenant

## Data Invariants
1. A regular user cannot escalate their own role to `SUPER_ADMIN`.
2. An `ADMIN_LOJA` can only read/write data associated with their `tenant_id`.
3. `SUPER_ADMIN` has global read/write access.
4. Documents in `produtos` (global catalog) are read-only for `ADMIN_LOJA` and read-write for `SUPER_ADMIN`.
5. Transactions and Stock movements must be linked to a valid tenant.

## The "Dirty Dozen" Payloads (Red Team Tests)

| # | Test Case | Expected Result |
|---|---|---|
| 1 | `ADMIN_LOJA` attempts to read a different tenant's document in `/tenants/` | PERMISSION_DENIED |
| 2 | Authenticated user without a profile attempts to write to `/produtos/` | PERMISSION_DENIED |
| 3 | `ADMIN_LOJA` attempts to update `tenant_id` of a product in `/estoque/` to a different tenant | PERMISSION_DENIED |
| 4 | User attempts to create a profile in `/users/` with `role: 'SUPER_ADMIN'` | PERMISSION_DENIED |
| 5 | `ADMIN_LOJA` attempts to list all documents in `/tenants/` without filtering by their ID | PERMISSION_DENIED |
| 6 | `ADMIN_LOJA` attempts to write a transaction to `/transacoes/` for a different tenant | PERMISSION_DENIED |
| 7 | Unauthenticated user attempts any read/write | PERMISSION_DENIED |
| 8 | `ADMIN_LOJA` attempts to delete a product from global `/produtos/` | PERMISSION_DENIED |
| 9 | User attempts to inject a 2MB string into `nome` field | PERMISSION_DENIED |
| 10 | `ADMIN_LOJA` attempts to read user profiles from a different tenant | PERMISSION_DENIED |
| 11 | `ADMIN_LOJA` attempts to update their own `tenant_id` to "system_admin" | PERMISSION_DENIED |
| 12 | User attempts to create a stock movement where `quantidade` is negative | PERMISSION_DENIED |

---
**Bootstrapped Admin:** baraodaserra@hotmail.com
