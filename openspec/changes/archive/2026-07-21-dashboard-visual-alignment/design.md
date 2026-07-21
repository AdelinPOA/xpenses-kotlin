# Design: Dashboard Visual Alignment & Layout Fixes

## 1. Copy Cleanup
Replace all instances of `"Total spend last order"` with `"Total Monthly Spend"` in `DashboardClient.tsx`.

## 2. Category Progress Bar Math
In `DashboardClient.tsx`:
Calculate overall spend `totalCategorySpend = data.spend_by_category.reduce((sum, c) => sum + c.total, 0)`.
For each category `s`, set percentage = `totalCategorySpend > 0 ? (s.total / totalCategorySpend) * 100 : 0`.

## 3. Mobile Item Alignment
In `DashboardClient.tsx` (Mobile view):
Ensure recent expense items use flex flex-col / flex-row layout with proper shrink and minimum width constraints so merchant name truncates smoothly, and the amount + status badge are right-aligned cleanly without wrapping onto line breaks.

## 4. SVG Gauge Refactor
In `ExpenseStatusOverview.tsx`:
Simplify the semi-circle gauge calculation using standard arc math or fixed 180-degree `strokeDasharray` without counter-rotation glitches.

## 5. SpendChart Aspect Ratio
In `SpendChart.tsx`:
Ensure SVG scaling maintains crisp stroke width and smooth responsive layout.
