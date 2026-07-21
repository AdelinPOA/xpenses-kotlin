# Proposal: Report Deletion Options (Cascade Soft-Delete vs Keep Drafts)

## Intent
Allow users deleting a draft report to choose whether to:
1. Soft-delete the attached expenses along with the report.
2. Keep the expenses as standalone draft expenses (unattached).

## Scope
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/controllers/ReportController.kt`
- `backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/services/ReportService.kt`
- `frontend/app/reports/page.tsx`
- `frontend/app/reports/[id]/page.tsx`
- `backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/controllers/ReportControllerTest.kt`
