## 1. Config + Database

- [x] 1.1 Add two settings to `backend/xpenses/config.py` `Settings` class:
  - `mileage_rate_before_tax: float = 0.30` (gross/accounting rate)
  - `mileage_rate_after_tax: float = 0.22` (net rate for reimbursement)
- [x] 1.2 Add `mileage_records` table to `CREATE_TABLES` in `backend/xpenses/database.py`:
```sql
CREATE TABLE IF NOT EXISTS mileage_records (
    id SERIAL PRIMARY KEY,
    report_id INTEGER NOT NULL REFERENCES expense_reports(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id),
    origin TEXT NOT NULL,
    destination TEXT NOT NULL,
    distance_km DOUBLE PRECISION NOT NULL,
    rate_before_tax DOUBLE PRECISION NOT NULL,
    rate_after_tax DOUBLE PRECISION NOT NULL,
    amount_before_tax DOUBLE PRECISION NOT NULL,
    amount_eur DOUBLE PRECISION NOT NULL,
    date TEXT NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```
- [x] 1.3 Add index: `CREATE INDEX IF NOT EXISTS idx_mileage_records_report ON mileage_records(report_id);`
- [x] 1.4 Rebuild backend: `make rebuild`
- [x] 1.5 Verify table exists: `docker exec -it xpenses-db psql -U xpenses -c "\d mileage_records"`

## 2. Pydantic Models

- [x] 2.1 Add to `backend/xpenses/models.py`:
```python
class MileageRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: int
    origin: str
    destination: str
    distance_km: float
    rate_before_tax: float
    rate_after_tax: float
    amount_before_tax: float
    amount_eur: float
    date: str
    description: str | None
    created_at: datetime
    updated_at: datetime

class MileageRecordCreate(BaseModel):
    origin: str
    destination: str
    distance_km: float
    date: str
    description: str | None = None

class MileageRecordUpdate(BaseModel):
    origin: str | None = None
    destination: str | None = None
    distance_km: float | None = None
    date: str | None = None
    description: str | None = None
```
- [x] 2.2 Add `mileage_records: list[MileageRecordOut] = []` and `total_mileage_eur: float = 0.0` to `ReportOut`

## 3. Backend Router

- [x] 3.1 Create `backend/xpenses/routers/mileage.py` following the `advances.py` pattern:
  - Router prefix: `/api/reports/{report_id}/mileage`
  - Reuse `_verify_report_ownership` pattern from advances.py
  - `GET ""` — list mileage records for report (ordered by date)
  - `POST ""` — create record. Compute `amount_before_tax = distance_km * settings.mileage_rate_before_tax` and `amount_eur = distance_km * settings.mileage_rate_after_tax`. Store both rates from config. Check report is draft + ownership.
  - `PATCH "/{mileage_id}"` — update record. Recalculate both amounts if `distance_km` changes (use stored rates). Check report is draft.
  - `DELETE "/{mileage_id}"` — delete record. Check report is draft.
- [x] 3.2 Register router in `backend/xpenses/main.py`: `from .routers.mileage import router as mileage_router` + `app.include_router(mileage_router)`
- [x] 3.3 Rebuild: `make rebuild`

## 4. Report Integration

- [x] 4.1 Update `_fetch_report` in `backend/xpenses/routers/reports.py` to fetch mileage records:
```python
mileage_rows = await db.fetch(
    "SELECT * FROM mileage_records WHERE report_id = $1 ORDER BY date",
    report_id,
)
report["mileage_records"] = [dict(m) for m in mileage_rows]
report["total_mileage_eur"] = sum(m["amount_eur"] for m in report["mileage_records"])
```
- [x] 4.2 Update `total_reimbursable` calculation in `_fetch_report` to include mileage:
```python
report["total_reimbursable"] = total_expenses + allowance + report["total_mileage_eur"] - report["total_advances"]
```
- [x] 4.3 Update PDF export in `backend/xpenses/routers/reports.py` `export_report_pdf` to fetch and pass mileage:
```python
mileage_rows = await db.fetch(
    "SELECT * FROM mileage_records WHERE report_id = $1 ORDER BY date",
    report_id,
)
mileage = [dict(m) for m in mileage_rows]
pdf_bytes = await generate_report_pdf(report, expenses, advances, mileage)
```

## 5. PDF Export

- [x] 5.1 Update `generate_report_pdf` signature in `backend/xpenses/services/pdf_export.py` to accept `mileage: list[dict] = []`
- [x] 5.2 Add mileage table section to PDF (after advances, before summary):
  - Headers: Date | Origin | Destination | Distance (km) | Rate Before Tax (€/km) | Gross (€) | Rate After Tax (€/km) | Net (€)
  - Row per record
  - Total row: sum of km and sum of amount_eur
- [x] 5.3 Include `total_mileage_eur` in the report summary section (Total Expenses + Allowance + Mileage - Advances = Reimbursable)

## 6. Backend Tests

- [x] 6.1 Add `create_mileage` helper to `backend/tests/conftest.py`:
```python
async def create_mileage(client, report_id, **kwargs):
    defaults = {"origin": "Bucharest", "destination": "Ploiesti", "distance_km": 60.0, "date": "2026-01-10"}
    defaults.update(kwargs)
    resp = await client.post(f"/api/reports/{report_id}/mileage", json=defaults)
    assert resp.status_code == 201
    return resp.json()
```
- [x] 6.2 Create `backend/tests/test_mileage.py` with tests:
  - `test_create_mileage` — verify fields, `amount_before_tax = 60 * 0.30 = 18.0`, `amount_eur = 60 * 0.22 = 13.2`, both rates stored
  - `test_list_mileage` — create 2 records, verify list returns both ordered by date
  - `test_update_mileage_distance` — update `distance_km`, verify both `amount_before_tax` and `amount_eur` recalculated
  - `test_delete_mileage` — create + delete, verify 204, verify list is empty
  - `test_create_mileage_non_draft_report` — submit report, try to add mileage, expect 400
  - `test_create_mileage_not_owner` — login as different user, try to add to other's report, expect 403
  - `test_report_total_includes_mileage` — create report + expense + mileage, verify `total_mileage_eur` and `total_reimbursable` include mileage
- [x] 6.3 Run tests: `make test` — all should pass

## 7. Frontend Types + API

- [x] 7.1 Add to `frontend/lib/api.ts`:
```typescript
export interface MileageRecord {
  id: number;
  report_id: number;
  user_id: number;
  origin: string;
  destination: string;
  distance_km: number;
  rate_before_tax: number;
  rate_after_tax: number;
  amount_before_tax: number;
  amount_eur: number;
  date: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}
```
- [x] 7.2 Add `mileage_records: MileageRecord[]` and `total_mileage_eur: number` to the `Report` interface
- [x] 7.3 Add `mileageKeys` to `frontend/lib/queryKeys.ts`

## 8. Frontend — Report Detail Page

- [x] 8.1 Add mileage metric card to the stats grid in `frontend/app/reports/[id]/page.tsx` (next to Advances card):
```tsx
<Link href={`/reports/${id}/mileage`} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-teal-300 dark:hover:ring-teal-700 transition-all">
  <p className="text-xs text-teal-400 dark:text-teal-500 uppercase mb-1">Mileage</p>
  <p className="text-xl font-bold text-teal-600 dark:text-teal-400">{formatAmount(report.total_mileage_eur || 0, "EUR")}</p>
  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">View details →</p>
</Link>
```

## 9. Frontend — Mileage Page

- [x] 9.1 Create `frontend/app/reports/[id]/mileage/page.tsx` following the advances page pattern:
  - Back link to `/reports/[id]`
  - Inline form (origin, destination, distance_km, date, description) — visible when report is draft
  - Table: Date | Origin → Destination | Distance | Rate | Amount | Actions (delete button if draft)
  - Total row at bottom
  - TanStack Query for data fetching, mutations for create/delete
- [ ] 9.2 Test in browser: create report → navigate to mileage tab → add record → verify total updates → delete record

## 10. Commit + Verify

- [ ] 10.1 Run `make lint-fix` then `make test` — all tests pass
- [ ] 10.2 Commit and push
