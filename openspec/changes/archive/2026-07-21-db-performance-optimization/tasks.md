# Tasks: DB Performance Optimization

- [x] 1. Add `findAllWithFiltersPaged` method to `ExpenseReportRepository` in `Repositories.kt`.
- [x] 2. Update `listReports` in `ReportController.kt` to use SQL DB pagination for paged requests.
- [x] 3. Remove redundant `.toLong()` in `DashboardController.kt`.
- [x] 4. Run backend test suite (`./gradlew test --rerun-tasks --no-daemon`).
- [x] 5. Run frontend static verification (`npx tsc --noEmit && npm run lint`).
