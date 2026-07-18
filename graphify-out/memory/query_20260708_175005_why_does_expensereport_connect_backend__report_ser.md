---
type: "query"
date: "2026-07-08T17:50:05.422968+00:00"
question: "Why does ExpenseReport connect Backend: Report Service to Backend: Report APIs, Backend: Mileage APIs, Unit & Integration Tests, Backend: Advance APIs, Backend: Pdf Service, and Backend: Emailimport Service?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["ExpenseReport", "ReportService", "PdfService", "EmailImportService", "ReportController", "MileageController", "AdvanceController"]
---

# Q: Why does ExpenseReport connect Backend: Report Service to Backend: Report APIs, Backend: Mileage APIs, Unit & Integration Tests, Backend: Advance APIs, Backend: Pdf Service, and Backend: Emailimport Service?

## Answer

ExpenseReport is the central domain entity that ties the financial reports workflow together. It is defined in Models.kt and acts as a bridge across: 1) ReportService for lifecycle state updates, 2) ReportController, MileageController, and AdvanceController for IDOR ownership validation, 3) PdfService for PDF rendering, 4) EmailImportService for parsing incoming reports, and 5) testing suites like ReportStateMachineTest and PdfServiceTest to verify lifecycle and PDF outputs.

## Outcome

- Signal: useful

## Source Nodes

- ExpenseReport
- ReportService
- PdfService
- EmailImportService
- ReportController
- MileageController
- AdvanceController