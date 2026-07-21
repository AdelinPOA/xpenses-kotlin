# Design Document: Fix Security & Authorization Permissions

## 1. Manager Access Alignment
### Context
`ReportController.kt` allows `manager`, `chef_finance`, and `mod` to list, view, approve, and reject expense reports. However, `ExpenseController.kt` endpoints (`GET /api/expenses/{id}`, `GET /api/expenses/{id}/receipts/{receiptId}`, and `GET /api/expenses/{id}/receipts/{receiptId}/download`) restricted access to `listOf("chef_finance", "mod")` unless the expense belonged to `currentUser`.

### Fix
Update role check in `ExpenseController` to include `manager`:
`if (currentUser.role !in listOf("chef_finance", "mod", "manager") && expense.user?.id != currentUser.id)`

## 2. Refresh Token Reuse & Revocation
### Context
When a refresh token was submitted to `/api/auth/refresh`, if it was invalid or already consumed/rotated, the controller simply returned `401 Unauthorized`.

### Fix
Upon refresh token failure:
- Clear auth cookies on response.
- Invalidate all refresh tokens for the user (`refreshTokenRepository.deleteByUserId(user.id!!)`).
- Increment `user.tokenVersion++` to invalidate all issued stateless JWT access tokens immediately.
