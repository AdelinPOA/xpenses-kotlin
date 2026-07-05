## Context

The PDF export functionality of expense reports generates a structured document containing multiple tables: Expense Summary, Advance Payments, and Mileage. The Mileage table currently has a bottom summary/total row showing total duration, total kilometers, total gross, and total net amounts. However, the Expense Summary and Advance Payments tables do not have bottom total rows, forcing users to manually calculate these sums.

## Goals / Non-Goals

**Goals:**
- Add a consistent total summary row at the bottom of the **Expense Summary** table.
- Add a consistent total summary row at the bottom of the **Advance Payments** table.
- Ensure the sum of original amounts in EUR is computed and displayed in these total rows.

**Non-Goals:**
- Changing the overall page layout, header styling, margins, or fonts of the PDF.
- Summarizing the original currency values (which can be a mix of USD, EUR, etc.) in the totals (only EUR totals will be calculated).

## Decisions

### Add Total Rows to PDF Tables

We will append a summary row to both `expTable` and `advTable` using openpdf's `PdfPCell` and `Phrase`. 

*   **Expense Summary Table**:
    *   Columns: S.No (blank), Expense Details ("TOTAL" in bold), Category (blank), Amount (blank), Amount (EUR) (sum of `amountEur`).
*   **Advance Payments Table**:
    *   Columns: S.No (blank), Date ("TOTAL" in bold), Description (blank), Amount (blank), Amount (EUR) (sum of `amountEur` for paid advances).

*Alternative considered*: Merging columns 1 to 4 and displaying "TOTAL" across them, then displaying the total in column 5.
*Rationale*: Instantiating blank cells for columns 1, 3, and 4 is simpler to implement and matches the grid structure of the existing Mileage table's total row without requiring complex column-span logic (`colspan`).

## Risks / Trade-offs

- **[Risk]**: Adding extra rows might push the content to an additional page.
  - **Mitigation**: The page height budget is handled by the PDF generator automatically (it wraps to the next page as needed). The total row is only one line, so the impact is minimal.
