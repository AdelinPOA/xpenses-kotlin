# Tasks: Report Deletion Options

- [x] 1. Update `ReportController.kt` `deleteReport` endpoint to accept `delete_expenses` query parameter and execute conditional soft delete vs detachment.
- [x] 2. Update frontend report deletion confirmation modal in `frontend/app/reports/page.tsx` and `frontend/app/reports/[id]/page.tsx`.
- [x] 3. Add backend integration test in `ReportControllerTest.kt` for `delete_expenses=true` and `delete_expenses=false`.
- [x] 4. Run backend tests and frontend static checks.
