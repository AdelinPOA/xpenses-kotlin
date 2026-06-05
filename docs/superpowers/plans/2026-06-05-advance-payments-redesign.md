# Advance Payments Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign advance payments from inline records to a request/pay workflow with dedicated pages, adding status tracking, manager approval, and a global pending-requests dashboard.

**Architecture:** Extend the existing `advance_payments` table with `status`, `requested_amount`, `paid_by`, and related columns. Add pay/reject action endpoints to the existing advances router, plus a new global `/api/advances/pending` endpoint. Create two new frontend pages: a report-scoped `/reports/[id]/advances` page and a global `/advances` manager page.

**Tech Stack:** FastAPI + asyncpg (backend), Next.js 15 + React 19 + TanStack Query v5 (frontend), PostgreSQL 16, Tailwind CSS v4, reportlab (PDF).

**Spec:** `docs/superpowers/specs/2026-06-05-advance-payments-redesign.md`

---

## File Structure

### Files to create
| File | Responsibility |
|------|---------------|
| `frontend/app/reports/[id]/advances/page.tsx` | Dedicated report-scoped advances page |
| `frontend/app/advances/page.tsx` | Global manager advances page |

### Files to modify
| File | Changes |
|------|---------|
| `backend/xpenses/database.py` | Add new columns to `advance_payments` via ALTER TABLE migration |
| `backend/xpenses/models.py` | Add `AdvancePayBody`, `AdvanceRejectBody`; update `AdvancePaymentOut`, `AdvancePaymentCreate` |
| `backend/xpenses/routers/advances.py` | Add `type` param to create, add pay/reject endpoints, add global pending endpoint, update permissions |
| `backend/xpenses/main.py` | No changes needed (advances router already registered) |
| `backend/xpenses/routers/reports.py` | Filter `total_advances` to `status='paid'` only |
| `backend/xpenses/services/pdf_export.py` | Filter advances to `status='paid'` only |
| `backend/tests/conftest.py` | Update `create_advance` helper with `type` param |
| `backend/tests/test_advances.py` | Update existing tests, add ~9 new tests |
| `frontend/lib/api.ts` | Update `AdvancePayment` interface with new fields |
| `frontend/lib/queryKeys.ts` | Add `advanceKeys.pending` |
| `frontend/app/reports/[id]/page.tsx` | Remove inline advances UI, add link to dedicated page |
| `frontend/components/layout/Sidebar.tsx` | Add "Advances" nav entry for managers |

---

### Task 1: Database schema migration

**Files:**
- Modify: `backend/xpenses/database.py:127-166` (inside `init_db()`)

- [ ] **Step 1: Add new columns via ALTER TABLE migration**

In `backend/xpenses/database.py`, add the following block inside `init_db()`, after the existing `approved_by`/`approved_at`/`rejected_reason` migration block (after line 165) and before the "Seed default categories" comment:

```python
        # Add advance_payments workflow columns if missing
        for col, col_type in [
            ("status", "TEXT DEFAULT 'paid'"),
            ("requested_amount", "DOUBLE PRECISION"),
            ("requested_currency", "TEXT"),
            ("paid_by", "INTEGER REFERENCES users(id)"),
            ("paid_at", "TIMESTAMPTZ"),
            ("rejected_by", "INTEGER REFERENCES users(id)"),
            ("rejected_at", "TIMESTAMPTZ"),
        ]:
            col_exists = await conn.fetchval(
                "SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='advance_payments' AND column_name=$1)",
                col,
            )
            if not col_exists:
                await conn.execute(f"ALTER TABLE advance_payments ADD COLUMN {col} {col_type}")

        # Backfill status for existing rows that have NULL status
        await conn.execute("UPDATE advance_payments SET status = 'paid' WHERE status IS NULL")
```

- [ ] **Step 2: Add status index**

In `backend/xpenses/database.py`, add this line after the existing `idx_advance_payments_user` index (line 110):

```sql
CREATE INDEX IF NOT EXISTS idx_advance_payments_status ON advance_payments(status);
```

- [ ] **Step 3: Verify migration runs**

```bash
docker compose up -d --build backend && docker compose logs -f backend 2>&1 | head -30
```

Expected: Backend starts without errors. Check for "Application startup complete."

- [ ] **Step 4: Verify columns exist**

```bash
docker compose exec db psql -U xpenses -c "\d advance_payments"
```

Expected: Table shows `status`, `requested_amount`, `requested_currency`, `paid_by`, `paid_at`, `rejected_by`, `rejected_at` columns.

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/database.py
git commit -m "feat(db): add advance_payments workflow columns (status, paid_by, rejected_by)"
```

---

### Task 2: Backend models

**Files:**
- Modify: `backend/xpenses/models.py:152-179`

- [ ] **Step 1: Update AdvancePaymentOut**

Replace the existing `AdvancePaymentOut` class (lines 154-166) with:

```python
class AdvancePaymentOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    report_id: int
    user_id: int
    status: str
    amount_original: float
    currency_original: str
    amount_eur: float
    fx_rate: float
    date: str
    description: str | None
    requested_amount: float | None = None
    requested_currency: str | None = None
    paid_by: int | None = None
    paid_by_name: str | None = None
    paid_at: datetime | None = None
    rejected_by: int | None = None
    rejected_by_name: str | None = None
    rejected_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 2: Update AdvancePaymentCreate**

Replace the existing `AdvancePaymentCreate` class (lines 168-172) with:

```python
class AdvancePaymentCreate(BaseModel):
    type: str = "paid"
    amount: float
    currency: str = "EUR"
    date: str | None = None
    description: str | None = None
```

- [ ] **Step 3: Add new request models**

After `AdvancePaymentUpdate`, add:

```python
class AdvancePayBody(BaseModel):
    amount: float
    currency: str = "EUR"
    date: str


class AdvanceRejectBody(BaseModel):
    reason: str = ""
```

- [ ] **Step 4: Add PendingAdvanceOut for the global endpoint**

After `AdvanceRejectBody`, add:

```python
class PendingAdvanceOut(AdvancePaymentOut):
    user_display_name: str = ""
    report_title: str = ""
```

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/models.py
git commit -m "feat(models): add advance payment workflow models (pay, reject, pending)"
```

---

### Task 3: Backend advances router — refactor create + add pay/reject/pending

**Files:**
- Modify: `backend/xpenses/routers/advances.py`

- [ ] **Step 1: Update imports**

Replace the imports at the top of the file with:

```python
from datetime import datetime

import asyncpg
from fastapi import APIRouter, Depends, HTTPException, Query

from ..auth import get_current_user, require_role
from ..database import get_db, get_pool
from ..models import (
    AdvancePayBody,
    AdvancePaymentCreate,
    AdvancePaymentOut,
    AdvancePaymentUpdate,
    AdvanceRejectBody,
    PendingAdvanceOut,
)
from ..services.fx_service import get_rate
```

- [ ] **Step 2: Add helper to enrich advances with user names**

After the `_verify_report_ownership` function, add:

```python
async def _enrich_advance(db: asyncpg.Connection, row: dict) -> dict:
    adv = dict(row)
    if adv.get("paid_by"):
        u = await db.fetchval("SELECT display_name FROM users WHERE id = $1", adv["paid_by"])
        adv["paid_by_name"] = u
    if adv.get("rejected_by"):
        u = await db.fetchval("SELECT display_name FROM users WHERE id = $1", adv["rejected_by"])
        adv["rejected_by_name"] = u
    return adv
```

- [ ] **Step 3: Update list_advances to support status filter**

Replace the `list_advances` function with:

```python
@router.get("", response_model=list[AdvancePaymentOut])
async def list_advances(
    report_id: int,
    status: str | None = Query(None),
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    if status:
        rows = await db.fetch(
            "SELECT * FROM advance_payments WHERE report_id = $1 AND status = $2 ORDER BY date",
            report_id, status,
        )
    else:
        rows = await db.fetch(
            "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
            report_id,
        )
    return [await _enrich_advance(db, r) for r in rows]
```

- [ ] **Step 4: Rewrite create_advance to support type=paid and type=request**

Replace the `create_advance` function with:

```python
@router.post("", response_model=AdvancePaymentOut, status_code=201)
async def create_advance(
    report_id: int,
    body: AdvancePaymentCreate,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    is_owner = report["user_id"] == current_user["id"]
    is_privileged = current_user["role"] in ("manager", "chef_finance", "mod")

    if body.type == "request":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the report owner can request advances")
        now = datetime.utcnow()
        row = await db.fetchrow(
            """INSERT INTO advance_payments
               (report_id, user_id, amount_original, currency_original, amount_eur, fx_rate,
                date, description, status, requested_amount, requested_currency, created_at, updated_at)
               VALUES ($1, $2, 0, $3, 0, 0, '', $4, 'requested', $5, $6, $7, $8)
               RETURNING *""",
            report_id, current_user["id"], body.currency.upper(), body.description,
            body.amount, body.currency.upper(), now, now,
        )
        return await _enrich_advance(db, row)

    # type == "paid" (self-paid or manager-paid)
    if is_owner and report["status"] != "draft":
        raise HTTPException(status_code=400, detail="Technicians can only add self-paid advances to draft reports")
    if not is_owner and not is_privileged:
        raise HTTPException(status_code=403, detail="Not authorized")
    if not body.date:
        raise HTTPException(status_code=400, detail="Date is required for paid advances")

    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    now = datetime.utcnow()

    row = await db.fetchrow(
        """INSERT INTO advance_payments
           (report_id, user_id, amount_original, currency_original, amount_eur, fx_rate,
            date, description, status, paid_by, paid_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'paid', $9, $10, $11, $12)
           RETURNING *""",
        report_id, current_user["id"] if is_owner else report["user_id"],
        body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, body.description, current_user["id"] if is_privileged else None,
        now if is_privileged else None, now, now,
    )
    return await _enrich_advance(db, row)
```

- [ ] **Step 5: Update delete_advance for new permission rules**

Replace the `delete_advance` function with:

```python
@router.delete("/{advance_id}", status_code=204)
async def delete_advance(
    report_id: int,
    advance_id: int,
    current_user: dict = Depends(get_current_user),
    db: asyncpg.Connection = Depends(get_db),
):
    report = await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")

    is_owner = report["user_id"] == current_user["id"]
    is_privileged = current_user["role"] in ("manager", "chef_finance", "mod")

    if adv["status"] == "requested":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the request owner can cancel")
    elif adv["status"] == "paid":
        if report["status"] != "draft":
            raise HTTPException(status_code=400, detail="Can only delete paid advances on draft reports")
        if not is_owner and not is_privileged:
            raise HTTPException(status_code=403, detail="Not authorized")
    elif adv["status"] == "rejected":
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only the owner can delete rejected advances")

    await db.execute("DELETE FROM advance_payments WHERE id = $1", advance_id)
```

- [ ] **Step 6: Add pay endpoint**

After `delete_advance`, add:

```python
@router.post("/{advance_id}/pay", response_model=AdvancePaymentOut)
async def pay_advance(
    report_id: int,
    advance_id: int,
    body: AdvancePayBody,
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")
    if adv["status"] != "requested":
        raise HTTPException(status_code=400, detail="Only requested advances can be paid")

    try:
        fx_rate = await get_rate(body.currency, body.date)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch exchange rate: {e}")

    amount_eur = round(body.amount * fx_rate, 2)
    now = datetime.utcnow()

    await db.execute(
        """UPDATE advance_payments
           SET amount_original = $1, currency_original = $2, amount_eur = $3, fx_rate = $4,
               date = $5, status = 'paid', paid_by = $6, paid_at = $7, updated_at = $8
           WHERE id = $9""",
        body.amount, body.currency.upper(), amount_eur, fx_rate,
        body.date, current_user["id"], now, now, advance_id,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return await _enrich_advance(db, row)
```

- [ ] **Step 7: Add reject endpoint**

After `pay_advance`, add:

```python
@router.post("/{advance_id}/reject", response_model=AdvancePaymentOut)
async def reject_advance(
    report_id: int,
    advance_id: int,
    body: AdvanceRejectBody = AdvanceRejectBody(),
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    await _verify_report_ownership(db, report_id, current_user)
    adv = await db.fetchrow(
        "SELECT * FROM advance_payments WHERE id = $1 AND report_id = $2",
        advance_id, report_id,
    )
    if not adv:
        raise HTTPException(status_code=404, detail="Advance payment not found")
    if adv["status"] != "requested":
        raise HTTPException(status_code=400, detail="Only requested advances can be rejected")

    now = datetime.utcnow()
    await db.execute(
        """UPDATE advance_payments
           SET status = 'rejected', rejected_by = $1, rejected_at = $2, updated_at = $3,
               description = CASE WHEN $4 = '' THEN description ELSE description || ' [Rejected: ' || $4 || ']' END
           WHERE id = $5""",
        current_user["id"], now, now, body.reason, advance_id,
    )
    row = await db.fetchrow("SELECT * FROM advance_payments WHERE id = $1", advance_id)
    return await _enrich_advance(db, row)
```

- [ ] **Step 8: Add global pending endpoint**

After `reject_advance`, add (this uses a separate prefix via `@router` with a different path pattern — add it as a standalone function on the same router):

Actually, the global endpoint needs a different prefix (`/api/advances/pending` vs `/api/reports/{report_id}/advances`). Add a second router at the bottom of the file:

```python
global_router = APIRouter(prefix="/api/advances", tags=["advances"])


@global_router.get("/pending", response_model=list[PendingAdvanceOut])
async def list_pending_advances(
    current_user: dict = require_role("manager", "chef_finance", "mod"),
    db: asyncpg.Connection = Depends(get_db),
):
    rows = await db.fetch(
        """SELECT ap.*, u.display_name as user_display_name, er.title as report_title
           FROM advance_payments ap
           JOIN users u ON ap.user_id = u.id
           JOIN expense_reports er ON ap.report_id = er.id
           WHERE ap.status = 'requested'
           ORDER BY ap.created_at ASC""",
    )
    result = []
    for r in rows:
        adv = dict(r)
        adv["paid_by_name"] = None
        adv["rejected_by_name"] = None
        result.append(adv)
    return result
```

- [ ] **Step 9: Register global_router in main.py**

In `backend/xpenses/main.py`, the advances module already exports `router`. Update the import and add the global router:

Change line 8:
```python
from .routers import advances, auth, categories, dashboard, expenses, reports, users
```

And after `app.include_router(advances.router)` (line 34), add:
```python
app.include_router(advances.global_router)
```

- [ ] **Step 10: Commit**

```bash
git add backend/xpenses/routers/advances.py backend/xpenses/main.py
git commit -m "feat(api): advance payment request/pay/reject workflow + global pending endpoint"
```

---

### Task 4: Update report calculations and PDF export

**Files:**
- Modify: `backend/xpenses/routers/reports.py:56-63`
- Modify: `backend/xpenses/services/pdf_export.py:230,318`

- [ ] **Step 1: Filter total_advances to paid-only in _fetch_report**

In `backend/xpenses/routers/reports.py`, replace lines 56-63 (the advances block in `_fetch_report`) with:

```python
    advances = await db.fetch(
        "SELECT * FROM advance_payments WHERE report_id = $1 ORDER BY date",
        report_id,
    )
    report["advances"] = [dict(a) for a in advances]
    report["total_advances"] = sum(a["amount_eur"] for a in report["advances"] if a.get("status", "paid") == "paid")
    total_expenses = sum(e["amount_eur"] for e in report["expenses"])
    report["total_reimbursable"] = total_expenses - report["total_advances"]
```

- [ ] **Step 2: Filter PDF export advances to paid-only**

In `backend/xpenses/services/pdf_export.py`, update the advances filtering at line 230. Change:

```python
    if advances:
```

to:

```python
    paid_advances = [a for a in (advances or []) if a.get("status", "paid") == "paid"]
    if paid_advances:
```

Then replace all references to `advances` within the advance payments table section (lines 231-268) with `paid_advances`. Specifically change line 238:
```python
        for adv_idx, a in enumerate(paid_advances, start=1):
```

- [ ] **Step 3: Update report summary calculation**

In `backend/xpenses/services/pdf_export.py`, update line 318. Change:

```python
    total_advances_eur = sum(a["amount_eur"] for a in (advances or []))
```

to:

```python
    total_advances_eur = sum(a["amount_eur"] for a in (advances or []) if a.get("status", "paid") == "paid")
```

- [ ] **Step 4: Filter advances in export endpoint**

In `backend/xpenses/routers/reports.py`, the `export_report_pdf` function (line 296) already fetches all advances. No change needed — the PDF function now filters internally.

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/routers/reports.py backend/xpenses/services/pdf_export.py
git commit -m "fix: only count paid advances in totals and PDF export"
```

---

### Task 5: Update test infrastructure and existing tests

**Files:**
- Modify: `backend/tests/conftest.py:142-157`
- Modify: `backend/tests/test_advances.py`

- [ ] **Step 1: Update create_advance helper**

In `backend/tests/conftest.py`, replace the `create_advance` function (lines 142-157) with:

```python
async def create_advance(
    client: AsyncClient,
    report_id: int,
    *,
    amount: float = 100.0,
    currency: str = "EUR",
    date: str = "2026-01-10",
    description: str = "Cash advance",
    advance_type: str = "paid",
) -> dict:
    """Create an advance payment and return the response JSON."""
    body: dict = {
        "type": advance_type,
        "amount": amount,
        "currency": currency,
        "description": description,
    }
    if advance_type == "paid":
        body["date"] = date
    resp = await client.post(
        f"/api/reports/{report_id}/advances",
        json=body,
    )
    assert resp.status_code == 201, f"Create advance failed: {resp.text}"
    return resp.json()
```

- [ ] **Step 2: Update existing test_create_advance_eur**

In `backend/tests/test_advances.py`, update `test_create_advance_eur` to verify the new `status` field:

```python
@pytest.mark.asyncio
async def test_create_advance_eur(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=200.0, currency="EUR")

    assert adv["amount_original"] == 200.0
    assert adv["currency_original"] == "EUR"
    assert adv["amount_eur"] == 200.0
    assert adv["fx_rate"] == 1.0
    assert adv["report_id"] == report["id"]
    assert adv["description"] == "Cash advance"
    assert adv["status"] == "paid"
```

- [ ] **Step 3: Update test_report_total_reimbursable_calculation**

Replace the existing test to verify only paid advances count:

```python
@pytest.mark.asyncio
async def test_report_total_reimbursable_calculation(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client, amount=50.0)
    await client.post(f"/api/reports/{report['id']}/attach", json={"expense_ids": [expense["id"]]})
    await create_advance(client, report["id"], amount=30.0, advance_type="paid")
    await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.get(f"/api/reports/{report['id']}")
    data = resp.json()
    assert data["total_advances"] == 30.0
    assert data["total_reimbursable"] == 20.0
```

- [ ] **Step 4: Run existing tests to verify nothing is broken**

```bash
docker compose exec backend pytest tests/test_advances.py -v
```

Expected: Existing tests pass (some may need minor adjustments if the response shape changed — fix any failures).

- [ ] **Step 5: Commit**

```bash
git add backend/tests/conftest.py backend/tests/test_advances.py
git commit -m "test: update advance test infrastructure for request/pay workflow"
```

---

### Task 6: New backend tests for the request/pay workflow

**Files:**
- Modify: `backend/tests/test_advances.py`

- [ ] **Step 1: Add test_request_advance**

```python
@pytest.mark.asyncio
async def test_request_advance(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    assert adv["status"] == "requested"
    assert adv["requested_amount"] == 500.0
    assert adv["requested_currency"] == "EUR"
    assert adv["amount_eur"] == 0
    assert adv["amount_original"] == 0
```

- [ ] **Step 2: Add test_manager_pays_request**

```python
@pytest.mark.asyncio
async def test_manager_pays_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances/{adv['id']}/pay",
            json={"amount": 400.0, "currency": "EUR", "date": "2026-01-12"},
        )
        assert resp.status_code == 200
        paid = resp.json()
        assert paid["status"] == "paid"
        assert paid["amount_original"] == 400.0
        assert paid["amount_eur"] == 400.0
        assert paid["paid_by"] is not None
        assert paid["paid_by_name"] == "Manager One"
```

- [ ] **Step 3: Add test_manager_rejects_request**

```python
@pytest.mark.asyncio
async def test_manager_rejects_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances/{adv['id']}/reject",
            json={"reason": "Too much"},
        )
        assert resp.status_code == 200
        rejected = resp.json()
        assert rejected["status"] == "rejected"
        assert rejected["rejected_by"] is not None
```

- [ ] **Step 4: Add test_manager_adds_paid_advance_to_other_report**

```python
@pytest.mark.asyncio
async def test_manager_adds_paid_advance_to_other_report(client):
    await login(client, "tech1")
    report = await create_report(client)

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.post(
            f"/api/reports/{report['id']}/advances",
            json={"type": "paid", "amount": 200.0, "currency": "EUR", "date": "2026-01-10", "description": "Per diem"},
        )
        assert resp.status_code == 201
        adv = resp.json()
        assert adv["status"] == "paid"
        assert adv["paid_by"] is not None
```

- [ ] **Step 5: Add test_technician_cannot_pay_request**

```python
@pytest.mark.asyncio
async def test_technician_cannot_pay_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.post(
        f"/api/reports/{report['id']}/advances/{adv['id']}/pay",
        json={"amount": 400.0, "currency": "EUR", "date": "2026-01-12"},
    )
    assert resp.status_code == 403
```

- [ ] **Step 6: Add test_only_paid_advances_in_totals**

```python
@pytest.mark.asyncio
async def test_only_paid_advances_in_totals(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=100.0, advance_type="paid")
    await create_advance(client, report["id"], amount=9999.0, advance_type="request")

    resp = await client.get(f"/api/reports/{report['id']}")
    data = resp.json()
    assert data["total_advances"] == 100.0
```

- [ ] **Step 7: Add test_global_pending_endpoint**

```python
@pytest.mark.asyncio
async def test_global_pending_endpoint(client):
    await login(client, "tech1")
    report = await create_report(client)
    await create_advance(client, report["id"], amount=300.0, advance_type="request")
    await create_advance(client, report["id"], amount=100.0, advance_type="paid")

    # Technician cannot access global pending
    resp = await client.get("/api/advances/pending")
    assert resp.status_code == 403

    async with new_client() as mgr:
        await login(mgr, "manager1")
        resp = await mgr.get("/api/advances/pending")
        assert resp.status_code == 200
        pending = resp.json()
        assert len(pending) == 1
        assert pending[0]["requested_amount"] == 300.0
        assert pending[0]["user_display_name"] != ""
        assert pending[0]["report_title"] == "Test Report"
```

- [ ] **Step 8: Add test_technician_cancels_own_request**

```python
@pytest.mark.asyncio
async def test_technician_cancels_own_request(client):
    await login(client, "tech1")
    report = await create_report(client)
    adv = await create_advance(client, report["id"], amount=500.0, advance_type="request")

    resp = await client.delete(f"/api/reports/{report['id']}/advances/{adv['id']}")
    assert resp.status_code == 204
```

- [ ] **Step 9: Add test_request_advance_on_submitted_report**

```python
@pytest.mark.asyncio
async def test_request_advance_on_submitted_report(client):
    await login(client, "tech1")
    report = await create_report(client)
    expense = await create_expense(client)
    await client.post(f"/api/reports/{report['id']}/submit", json={"expense_ids": [expense["id"]]})

    adv = await create_advance(client, report["id"], amount=200.0, advance_type="request")
    assert adv["status"] == "requested"
```

- [ ] **Step 10: Run all tests**

```bash
docker compose exec backend pytest tests/ -v
```

Expected: All tests pass (existing 59 + ~9 new = ~68 tests).

- [ ] **Step 11: Commit**

```bash
git add backend/tests/test_advances.py
git commit -m "test: add 9 tests for advance request/pay/reject workflow"
```

---

### Task 7: Frontend types and query keys

**Files:**
- Modify: `frontend/lib/api.ts:50-61`
- Modify: `frontend/lib/queryKeys.ts:18-21`

- [ ] **Step 1: Update AdvancePayment interface**

In `frontend/lib/api.ts`, replace the `AdvancePayment` interface (lines 50-61) with:

```typescript
export interface AdvancePayment {
  id: number;
  report_id: number;
  user_id: number;
  status: "paid" | "requested" | "rejected";
  amount_original: number;
  currency_original: string;
  amount_eur: number;
  fx_rate: number;
  date: string;
  description: string | null;
  requested_amount: number | null;
  requested_currency: string | null;
  paid_by: number | null;
  paid_by_name: string | null;
  paid_at: string | null;
  rejected_by: number | null;
  rejected_by_name: string | null;
  rejected_at: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Add PendingAdvance interface**

After the `AdvancePayment` interface, add:

```typescript
export interface PendingAdvance extends AdvancePayment {
  user_display_name: string;
  report_title: string;
}
```

- [ ] **Step 3: Update query keys**

In `frontend/lib/queryKeys.ts`, replace the `advanceKeys` (lines 18-21) with:

```typescript
export const advanceKeys = {
  all: ["advances"] as const,
  list: (reportId: number) => [...advanceKeys.all, "list", reportId] as const,
  pending: () => [...advanceKeys.all, "pending"] as const,
};
```

- [ ] **Step 4: Commit**

```bash
git add frontend/lib/api.ts frontend/lib/queryKeys.ts
git commit -m "feat(frontend): update advance payment types and query keys for workflow"
```

---

### Task 8: Dedicated advances page

**Files:**
- Create: `frontend/app/reports/[id]/advances/page.tsx`

- [ ] **Step 1: Create the dedicated advances page**

```typescript
"use client";

import { use, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { Report, AdvancePayment, CURRENCIES } from "@/lib/api";
import { reportKeys, advanceKeys } from "@/lib/queryKeys";
import { useAuth } from "@/components/AuthProvider";
import AppShell from "@/components/layout/AppShell";
import Badge from "@/components/ui/Badge";
import { ArrowLeft, Plus, Check, X, Trash2 } from "lucide-react";
import Link from "next/link";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function AdvancesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const reportId = parseInt(id);
  const qc = useQueryClient();
  const { user } = useAuth();

  const [formType, setFormType] = useState<"paid" | "request" | null>(null);
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("EUR");
  const [date, setDate] = useState("");
  const [description, setDescription] = useState("");

  const [payingId, setPayingId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("EUR");
  const [payDate, setPayDate] = useState("");

  const { data: report, isLoading } = useQuery<Report>({
    queryKey: reportKeys.detail(reportId),
    queryFn: () => api.get(`/reports/${id}`).then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: reportKeys.detail(reportId) });
    qc.invalidateQueries({ queryKey: advanceKeys.all });
  };

  const addAdvance = useMutation({
    mutationFn: (data: { type: string; amount: number; currency: string; date?: string; description: string | null }) =>
      api.post(`/reports/${id}/advances`, data),
    onSuccess: () => {
      invalidate();
      setFormType(null);
      setAmount("");
      setCurrency("EUR");
      setDate("");
      setDescription("");
    },
  });

  const deleteAdvance = useMutation({
    mutationFn: (advanceId: number) => api.delete(`/reports/${id}/advances/${advanceId}`),
    onSuccess: invalidate,
  });

  const payAdvance = useMutation({
    mutationFn: ({ advanceId, ...body }: { advanceId: number; amount: number; currency: string; date: string }) =>
      api.post(`/reports/${id}/advances/${advanceId}/pay`, body),
    onSuccess: () => {
      invalidate();
      setPayingId(null);
      setPayAmount("");
      setPayCurrency("EUR");
      setPayDate("");
    },
  });

  const rejectAdvance = useMutation({
    mutationFn: ({ advanceId, reason }: { advanceId: number; reason: string }) =>
      api.post(`/reports/${id}/advances/${advanceId}/reject`, { reason }),
    onSuccess: invalidate,
  });

  const handleAdd = () => {
    const amt = parseFloat(amount);
    if (isNaN(amt) || amt <= 0) return;
    if (formType === "paid" && !date) return;
    addAdvance.mutate({
      type: formType!,
      amount: amt,
      currency,
      ...(formType === "paid" ? { date } : {}),
      description: description || null,
    });
  };

  const handlePay = (advanceId: number) => {
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    payAdvance.mutate({ advanceId, amount: amt, currency: payCurrency, date: payDate });
  };

  if (isLoading) return <AppShell><p className="text-slate-400 dark:text-slate-500 text-sm mt-8">Loading...</p></AppShell>;
  if (!report) return <AppShell><p className="text-red-500 text-sm">Report not found</p></AppShell>;

  const isOwner = user?.id === report.user_id;
  const isPrivileged = user && ["manager", "chef_finance", "mod"].includes(user.role);
  const canManage = user && ["manager", "chef_finance"].includes(user.role);

  const paidAdvances = report.advances.filter((a) => a.status === "paid");
  const requestedAdvances = report.advances.filter((a) => a.status === "requested");
  const rejectedAdvances = report.advances.filter((a) => a.status === "rejected");
  const totalPaid = paidAdvances.reduce((s, a) => s + a.amount_eur, 0);
  const totalRequested = requestedAdvances.reduce((s, a) => s + (a.requested_amount || 0), 0);

  return (
    <AppShell>
      {/* Header */}
      <div className="mb-6">
        <Link href={`/reports/${id}`} className="flex items-center gap-1 text-sm text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 mb-4">
          <ArrowLeft className="w-4 h-4" /> Back to report
        </Link>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Advance Payments</h1>
          <Badge status={report.status} />
        </div>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{report.title}</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-emerald-500 uppercase mb-1">Total Paid</p>
          <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400">{formatAmount(totalPaid, "EUR")}</p>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
          <p className="text-xs text-orange-500 uppercase mb-1">Pending Requests</p>
          <p className="text-xl font-bold text-orange-600 dark:text-orange-400">
            {requestedAdvances.length} — {formatAmount(totalRequested, "EUR")}
          </p>
        </div>
        {rejectedAdvances.length > 0 && (
          <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4">
            <p className="text-xs text-red-500 uppercase mb-1">Rejected</p>
            <p className="text-xl font-bold text-red-600 dark:text-red-400">{rejectedAdvances.length}</p>
          </div>
        )}
      </div>

      {/* Action buttons */}
      {(isOwner || isPrivileged) && (
        <div className="flex flex-wrap gap-3 mb-6">
          {isOwner && report.status === "draft" && (
            <button
              onClick={() => setFormType(formType === "paid" ? null : "paid")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "paid"
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Add self-paid
            </button>
          )}
          {isOwner && (
            <button
              onClick={() => setFormType(formType === "request" ? null : "request")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "request"
                  ? "bg-orange-600 text-white"
                  : "border border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Request advance
            </button>
          )}
          {isPrivileged && (
            <button
              onClick={() => setFormType(formType === "paid" ? null : "paid")}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
                formType === "paid"
                  ? "bg-emerald-600 text-white"
                  : "border border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
              }`}
            >
              <Plus className="w-4 h-4" /> Add paid advance
            </button>
          )}
        </div>
      )}

      {/* Add/Request form */}
      {formType && (
        <div className={`rounded-xl p-4 mb-6 border ${
          formType === "paid"
            ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800/50"
            : "bg-orange-50 dark:bg-orange-950/30 border-orange-200 dark:border-orange-800/50"
        }`}>
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            {formType === "paid" ? "Add paid advance:" : "Request advance from company:"}
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            {formType === "paid" && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
              />
            )}
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Amount"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <input
              type="text"
              placeholder="Description (optional)"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 flex-1"
            />
            <button
              onClick={handleAdd}
              disabled={addAdvance.isPending || !amount || (formType === "paid" && !date)}
              className={`flex items-center gap-2 px-4 py-2 text-white text-sm font-medium rounded-lg disabled:opacity-50 whitespace-nowrap ${
                formType === "paid" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-orange-600 hover:bg-orange-700"
              }`}
            >
              <Plus className="w-4 h-4" />
              {addAdvance.isPending ? "Adding..." : formType === "paid" ? "Add advance" : "Submit request"}
            </button>
          </div>
        </div>
      )}

      {/* Advances table */}
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
        <div className="p-4 border-b border-slate-100 dark:border-slate-700">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
            All Advances ({report.advances.length})
          </h2>
        </div>
        {report.advances.length === 0 ? (
          <p className="p-6 text-sm text-slate-400 dark:text-slate-500 text-center">No advance payments yet</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Status</th>
                  <th className="text-left px-4 py-3">Date</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-right px-4 py-3">Requested</th>
                  <th className="text-right px-4 py-3">Paid (EUR)</th>
                  <th className="text-left px-4 py-3">Paid By</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {[...requestedAdvances, ...paidAdvances, ...rejectedAdvances].map((a) => (
                  <tr key={a.id} className={`border-t border-slate-100 dark:border-slate-700 ${a.status === "rejected" ? "opacity-50" : ""}`}>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                        a.status === "paid" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400" :
                        a.status === "requested" ? "bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-400" :
                        "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400"
                      }`}>
                        {a.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-600 dark:text-slate-400">{a.date || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-right text-slate-500 dark:text-slate-400">
                      {a.requested_amount ? formatAmount(a.requested_amount, a.requested_currency || "EUR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900 dark:text-slate-100">
                      {a.status === "paid" ? formatAmount(a.amount_eur, "EUR") : "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.paid_by_name || "—"}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {a.status === "requested" && canManage && payingId !== a.id && (
                          <>
                            <button
                              onClick={() => { setPayingId(a.id); setPayAmount(String(a.requested_amount || "")); setPayCurrency(a.requested_currency || "EUR"); }}
                              className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                            >
                              Pay
                            </button>
                            <button
                              onClick={() => rejectAdvance.mutate({ advanceId: a.id, reason: "" })}
                              className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700"
                            >
                              Reject
                            </button>
                          </>
                        )}
                        {a.status === "requested" && isOwner && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {a.status === "paid" && report.status === "draft" && (isOwner || isPrivileged) && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                        {a.status === "rejected" && isOwner && (
                          <button onClick={() => deleteAdvance.mutate(a.id)} className="text-slate-400 hover:text-red-500">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Inline pay form */}
      {payingId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Set payment amount for request #{payingId}:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Final amount"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={() => handlePay(payingId)}
              disabled={payAdvance.isPending || !payAmount || !payDate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {payAdvance.isPending ? "Paying..." : "Confirm payment"}
            </button>
            <button
              onClick={() => setPayingId(null)}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/reports/\[id\]/advances/page.tsx
git commit -m "feat(frontend): dedicated report advances page with request/pay workflow"
```

---

### Task 9: Global advances page

**Files:**
- Create: `frontend/app/advances/page.tsx`

- [ ] **Step 1: Create the global advances page**

```typescript
"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import api, { PendingAdvance, CURRENCIES } from "@/lib/api";
import { advanceKeys, reportKeys } from "@/lib/queryKeys";
import AppShell from "@/components/layout/AppShell";
import { Check, X } from "lucide-react";
import Link from "next/link";

function formatAmount(amount: number, currency: string) {
  return new Intl.NumberFormat("en-EU", { style: "currency", currency }).format(amount);
}

export default function GlobalAdvancesPage() {
  const qc = useQueryClient();

  const [payingId, setPayingId] = useState<number | null>(null);
  const [payReportId, setPayReportId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState("");
  const [payCurrency, setPayCurrency] = useState("EUR");
  const [payDate, setPayDate] = useState("");

  const { data: pending = [], isLoading } = useQuery<PendingAdvance[]>({
    queryKey: advanceKeys.pending(),
    queryFn: () => api.get("/advances/pending").then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: advanceKeys.all });
    qc.invalidateQueries({ queryKey: reportKeys.all });
  };

  const payAdvance = useMutation({
    mutationFn: ({ reportId, advanceId, ...body }: { reportId: number; advanceId: number; amount: number; currency: string; date: string }) =>
      api.post(`/reports/${reportId}/advances/${advanceId}/pay`, body),
    onSuccess: () => {
      invalidate();
      setPayingId(null);
      setPayReportId(null);
      setPayAmount("");
      setPayCurrency("EUR");
      setPayDate("");
    },
  });

  const rejectAdvance = useMutation({
    mutationFn: ({ reportId, advanceId }: { reportId: number; advanceId: number }) =>
      api.post(`/reports/${reportId}/advances/${advanceId}/reject`, { reason: "" }),
    onSuccess: invalidate,
  });

  const handlePay = () => {
    if (!payingId || !payReportId) return;
    const amt = parseFloat(payAmount);
    if (isNaN(amt) || amt <= 0 || !payDate) return;
    payAdvance.mutate({ reportId: payReportId, advanceId: payingId, amount: amt, currency: payCurrency, date: payDate });
  };

  return (
    <AppShell>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Advance Requests</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Pending advance payment requests from technicians</p>
      </div>

      {isLoading ? (
        <p className="text-slate-400 dark:text-slate-500 text-sm">Loading...</p>
      ) : pending.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-8 text-center">
          <p className="text-slate-400 dark:text-slate-500 text-sm">No pending advance requests</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-800 text-xs text-slate-500 dark:text-slate-400 uppercase">
                <tr>
                  <th className="text-left px-4 py-3">Technician</th>
                  <th className="text-left px-4 py-3">Report</th>
                  <th className="text-right px-4 py-3">Requested Amount</th>
                  <th className="text-left px-4 py-3">Description</th>
                  <th className="text-left px-4 py-3">Date Requested</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pending.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100 dark:border-slate-700">
                    <td className="px-4 py-3 font-medium text-slate-800 dark:text-slate-200">{a.user_display_name}</td>
                    <td className="px-4 py-3">
                      <Link href={`/reports/${a.report_id}/advances`} className="text-blue-600 dark:text-blue-400 hover:underline">
                        {a.report_title}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-orange-600 dark:text-orange-400">
                      {formatAmount(a.requested_amount || 0, a.requested_currency || "EUR")}
                    </td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">{a.description || "—"}</td>
                    <td className="px-4 py-3 text-slate-500 dark:text-slate-400">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => {
                            setPayingId(a.id);
                            setPayReportId(a.report_id);
                            setPayAmount(String(a.requested_amount || ""));
                            setPayCurrency(a.requested_currency || "EUR");
                          }}
                          className="text-xs px-2 py-1 bg-emerald-600 text-white rounded hover:bg-emerald-700"
                        >
                          Pay
                        </button>
                        <button
                          onClick={() => rejectAdvance.mutate({ reportId: a.report_id, advanceId: a.id })}
                          disabled={rejectAdvance.isPending}
                          className="text-xs px-2 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inline pay form */}
      {payingId && (
        <div className="bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800/50 rounded-xl p-4 mt-4">
          <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-3">
            Set payment amount:
          </p>
          <div className="flex flex-col sm:flex-row gap-3">
            <input
              type="date"
              value={payDate}
              onChange={(e) => setPayDate(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            />
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="Final amount"
              value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 w-32"
            />
            <select
              value={payCurrency}
              onChange={(e) => setPayCurrency(e.target.value)}
              className="px-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg text-sm bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100"
            >
              {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
            <button
              onClick={handlePay}
              disabled={payAdvance.isPending || !payAmount || !payDate}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white text-sm font-medium rounded-lg hover:bg-emerald-700 disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              {payAdvance.isPending ? "Paying..." : "Confirm payment"}
            </button>
            <button
              onClick={() => { setPayingId(null); setPayReportId(null); }}
              className="flex items-center gap-2 px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 text-sm rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" /> Cancel
            </button>
          </div>
        </div>
      )}
    </AppShell>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/app/advances/page.tsx
git commit -m "feat(frontend): global advances page for manager advance request management"
```

---

### Task 10: Update report detail page and sidebar

**Files:**
- Modify: `frontend/app/reports/[id]/page.tsx`
- Modify: `frontend/components/layout/Sidebar.tsx`

- [ ] **Step 1: Remove inline advances from report detail page**

In `frontend/app/reports/[id]/page.tsx`:

1. Remove the advance-related state variables (lines 23-25): `advDate`, `advAmount`, `advCurrency`, `advDescription`
2. Remove the `addAdvance` mutation (lines 75-85)
3. Remove the `deleteAdvance` mutation (lines 87-93)
4. Remove the `handleAddAdvance` function (lines 103-112)
5. Remove the "Add advance payments" section (lines 256-304, the orange `bg-orange-50` div)
6. Remove the "Advance payments list" section (lines 410-458)

7. Make the "Advances" metric card a clickable link. Replace the static card (lines 185-188) with:

```tsx
<Link href={`/reports/${id}/advances`} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm p-4 hover:ring-2 hover:ring-orange-300 dark:hover:ring-orange-700 transition-all">
  <p className="text-xs text-orange-400 dark:text-orange-500 uppercase mb-1">Advances</p>
  <p className="text-xl font-bold text-orange-600 dark:text-orange-400">{formatAmount(report.total_advances, "EUR")}</p>
  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">View details →</p>
</Link>
```

8. Add the `Link` import if not already present (it is on line 11).

- [ ] **Step 2: Add Advances to sidebar**

In `frontend/components/layout/Sidebar.tsx`, add a new entry to the `NAV` array after the "Approvals" entry (line 22). The `Wallet` icon is already imported from lucide-react — if not, add it. Actually, use the existing `Banknote` icon is taken by Payments. Import `Wallet` from lucide-react:

Update line 6:
```typescript
import { LayoutDashboard, Receipt, FileText, Tag, Users, CheckSquare, Banknote, Wallet, LogOut, Sun, Moon, Monitor, X } from "lucide-react";
```

Add after the "Approvals" entry (after line 22):
```typescript
  { href: "/advances", label: "Advances", icon: Wallet, roles: ["manager", "chef_finance", "mod"] },
```

- [ ] **Step 3: Commit**

```bash
git add frontend/app/reports/\[id\]/page.tsx frontend/components/layout/Sidebar.tsx
git commit -m "feat(frontend): link to dedicated advances page, add Advances to sidebar"
```

---

### Task 11: Rebuild, test, and verify

- [ ] **Step 1: Rebuild all containers**

```bash
docker compose up -d --build
```

- [ ] **Step 2: Run all backend tests**

```bash
docker compose exec backend pytest tests/ -v
```

Expected: All ~68 tests pass.

- [ ] **Step 3: Run lint**

```bash
make lint
```

Expected: No new lint errors from the changes.

- [ ] **Step 4: Manual smoke test — technician flow**

1. Open http://localhost:3001, login as `tech1/tech1`
2. Create a report, navigate to it
3. Click "Advances" metric card → navigates to `/reports/[id]/advances`
4. Add a self-paid advance (€100, EUR, today's date)
5. Request an advance (€500, EUR)
6. Verify summary cards update

- [ ] **Step 5: Manual smoke test — manager flow**

1. Login as `manager1/manager1`
2. Navigate to "Advances" in sidebar → see the pending request from tech1
3. Click "Pay" → set amount to €400, today's date → confirm
4. Verify the request disappears from pending list
5. Navigate to tech1's report → advances page → verify the paid advance appears

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "feat: advance payments redesign — request/pay workflow, dedicated pages, global dashboard"
```

Plan complete and saved to `docs/superpowers/plans/2026-06-05-advance-payments-redesign.md`. Two execution options:

**1. Subagent-Driven (recommended)** - I dispatch a fresh subagent per task, review between tasks, fast iteration

**2. Inline Execution** - Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
