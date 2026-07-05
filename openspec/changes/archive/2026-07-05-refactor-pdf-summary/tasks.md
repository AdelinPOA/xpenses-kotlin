## 1. Implement PDF Summary Redesign

- [x] 1.1 Calculate `balance` in `PdfService.kt` based on the formula: `Total Advances - Total Expense - Daily Allowance - Mileage`.
- [x] 1.2 Redesign the PDF summary table layout to a single-row 9-column format with the updated labels and operators in `PdfService.kt`.

## 2. Test and Verify

- [x] 2.1 Update `PdfServiceTest.kt` to verify the new labels, operators, and positive/negative remaining balance calculations.
- [x] 2.2 Run the unit tests using `./gradlew test` to ensure correctness.
