# Proposal: Fix Security & Authorization Permissions

## Intent
Address critical security and permission gaps in the backend application:
1. Fix authorization checks in `ExpenseController` so users with the `manager` role can view expenses, single receipts, and download receipt files attached to submitted reports.
2. Implement immediate total revocation upon detecting refresh token reuse or invalid refresh token exchange to prevent session hijacking.

## Scope
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ExpenseController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/AuthController.kt`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/` (Integration tests for manager permissions & refresh token reuse)
