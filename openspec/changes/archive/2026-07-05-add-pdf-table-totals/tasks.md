## 1. Implement PDF Export Totals

- [x] 1.1 Calculate the sum of paid advances in `PdfService.kt` to make it accessible inside the Advance Payments block.
- [x] 1.2 Add the total row at the bottom of the Expense Summary table in `PdfService.kt`.
- [x] 1.3 Add the total row at the bottom of the Advance Payments table in `PdfService.kt`.

## 2. Test and Verify

- [x] 2.1 Add a unit test class `PdfServiceTest.kt` to verify that `PdfService.generateReportPdf` generates a valid PDF and includes the computed totals.
- [x] 2.2 Run the new unit test and the existing test suite using `./gradlew test`.
