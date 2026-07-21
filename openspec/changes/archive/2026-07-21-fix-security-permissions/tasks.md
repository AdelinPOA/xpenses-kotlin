# Tasks: Fix Security & Authorization Permissions

- [x] 1. Update `ExpenseController.kt` authorization checks to allow `manager` role for `getExpense`, `getSingleReceipt`, and `downloadReceipt`.
- [x] 2. Update `AuthController.kt` `/api/auth/refresh` to perform total revocation (`tokenVersion++` + `deleteByUserId`) when detecting token reuse or invalid token presentation.
- [x] 3. Run backend test suite (`./gradlew test --rerun-tasks --no-daemon`) and verify all integration tests pass.
- [x] 4. Run frontend static verification (`npx tsc --noEmit && npm run lint`).
