# Trigger Notifications in Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate email notifications into the report lifecycle (submit, approve, reject, pay) using FastAPI BackgroundTasks.

**Architecture:** 
- Use `fastapi.BackgroundTasks` to send emails asynchronously.
- Import `send_email` from `xpenses.services.email_service`.
- Fetch recipient emails and necessary details (submitter name, report title, etc.) within the route handlers.
- Query the `users` table to find all managers and chef_finance users for submission notifications.

**Tech Stack:** FastAPI, asyncpg, aiosmtplib (via email_service).

---

### Task 1: Create failing tests for Report Submitted notification

**Files:**
- Create: `backend/tests/test_report_notifications.py`

- [ ] **Step 1: Write the failing test for submission notification**

```python
import pytest
from unittest.mock import patch, AsyncMock
from tests.conftest import create_expense, create_report, login

@pytest.mark.asyncio
async def test_submit_report_triggers_emails(client):
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client, title="Monthly Trip")
    report_id = report["id"]

    await client.post(
        f"/api/reports/{report_id}/attach",
        json={"expense_ids": [expense["id"]]},
    )

    with patch("xpenses.routers.reports.send_email", new_callable=AsyncMock) as mock_send:
        resp = await client.post(f"/api/reports/{report_id}/submit")
        assert resp.status_code == 200
        
        # Should notify manager1 and cfo1 (from seed)
        # manager1: maria.ionescu@nt-automation.eu
        # cfo1: elena.dumitrescu@nt-automation.eu
        assert mock_send.call_count >= 2
        
        called_emails = [call.args[0] for call in mock_send.call_args_list]
        assert "maria.ionescu@nt-automation.eu" in called_emails
        assert "elena.dumitrescu@nt-automation.eu" in called_emails
        
        # Check subject and content for one call
        subject = mock_send.call_args_list[0].args[1]
        content = mock_send.call_args_list[0].args[2]
        assert "New expense report submitted: Monthly Trip" == subject
        assert "Ion Popescu" in content
        assert "Monthly Trip" in content
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_report_notifications.py::test_submit_report_triggers_emails -v`
Expected: FAIL (AssertionError: expected call_count >= 2, got 0)

### Task 2: Implement Submission Notification

**Files:**
- Modify: `backend/xpenses/routers/reports.py`

- [ ] **Step 1: Update imports and function signature**

```python
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from ..services.email_service import send_email
```

- [ ] **Step 2: Add logic to `submit_report` to send emails**

```python
@router.post("/{report_id}/submit", response_model=ReportOut)
async def submit_report(
    report_id: int, 
    background_tasks: BackgroundTasks,
    body: ReportSubmit | None = None, 
    current_user: dict = Depends(get_current_user), 
    db: asyncpg.Connection = Depends(get_db)
):
    # ... existing code ...
    
    # After updating report status to submitted:
    # Fetch managers and cfo
    approvers = await db.fetch(
        "SELECT email FROM users WHERE role IN ('manager', 'chef_finance') AND is_active = TRUE"
    )
    
    for appr in approvers:
        if appr["email"]:
            background_tasks.add_task(
                send_email,
                appr["email"],
                f"New expense report submitted: {row['title']}",
                f"{current_user['display_name']} has submitted a new expense report: {row['title']}. Total: {total} {row['currency']}."
            )
    
    return await _fetch_report(db, report_id)
```

- [ ] **Step 3: Run test to verify it passes**

Run: `pytest backend/tests/test_report_notifications.py::test_submit_report_triggers_emails -v`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add backend/xpenses/routers/reports.py backend/tests/test_report_notifications.py
git commit -m "feat: add submission notification"
```

### Task 3: Create failing tests for Approved, Rejected, Paid notifications

**Files:**
- Modify: `backend/tests/test_report_notifications.py`

- [ ] **Step 1: Write failing tests for other notifications**

```python
@pytest.mark.asyncio
async def test_approve_report_triggers_email(client):
    # Setup: tech1 submits a report
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client, title="Approved Report")
    report_id = report["id"]
    await client.post(f"/api/reports/{report_id}/attach", json={"expense_ids": [expense["id"]]})
    await client.post(f"/api/reports/{report_id}/submit")

    # Act: manager1 approves
    from tests.conftest import new_client, login as login_helper
    async with new_client() as manager_client:
        await login_helper(manager_client, "manager1")
        with patch("xpenses.routers.reports.send_email", new_callable=AsyncMock) as mock_send:
            resp = await manager_client.post(f"/api/reports/{report_id}/approve")
            assert resp.status_code == 200
            
            mock_send.assert_called_once()
            assert mock_send.call_args.args[0] == "ion.popescu@nt-automation.eu"
            assert "Expense report approved: Approved Report" == mock_send.call_args.args[1]
            assert "Maria Ionescu" in mock_send.call_args.args[2]

@pytest.mark.asyncio
async def test_reject_report_triggers_email(client):
    # Setup: tech1 submits
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client, title="Rejected Report")
    report_id = report["id"]
    await client.post(f"/api/reports/{report_id}/attach", json={"expense_ids": [expense["id"]]})
    await client.post(f"/api/reports/{report_id}/submit")

    # Act: manager1 rejects
    async with new_client() as manager_client:
        await login_helper(manager_client, "manager1")
        with patch("xpenses.routers.reports.send_email", new_callable=AsyncMock) as mock_send:
            resp = await manager_client.post(f"/api/reports/{report_id}/reject", json={"reason": "Wrong category"})
            assert resp.status_code == 200
            
            mock_send.assert_called_once()
            assert mock_send.call_args.args[0] == "ion.popescu@nt-automation.eu"
            assert "Expense report rejected: Rejected Report" == mock_send.call_args.args[1]
            assert "Wrong category" in mock_send.call_args.args[2]

@pytest.mark.asyncio
async def test_pay_report_triggers_email(client):
    # Setup: tech1 submits, manager1 approves
    await login(client, "tech1")
    expense = await create_expense(client)
    report = await create_report(client, title="Paid Report")
    report_id = report["id"]
    await client.post(f"/api/reports/{report_id}/attach", json={"expense_ids": [expense["id"]]})
    await client.post(f"/api/reports/{report_id}/submit")
    
    async with new_client() as manager_client:
        await login_helper(manager_client, "manager1")
        await manager_client.post(f"/api/reports/{report_id}/approve")

    # Act: cfo1 pays
    async with new_client() as cfo_client:
        await login_helper(cfo_client, "cfo1")
        with patch("xpenses.routers.reports.send_email", new_callable=AsyncMock) as mock_send:
            resp = await cfo_client.post(f"/api/reports/{report_id}/pay")
            assert resp.status_code == 200
            
            mock_send.assert_called_once()
            assert mock_send.call_args.args[0] == "ion.popescu@nt-automation.eu"
            assert "Expense report paid: Paid Report" == mock_send.call_args.args[1]
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pytest backend/tests/test_report_notifications.py -v`
Expected: 3 FAIL, 1 PASS (from Task 2)

### Task 4: Implement Approved, Rejected, Paid Notifications

**Files:**
- Modify: `backend/xpenses/routers/reports.py`

- [ ] **Step 1: Implement `approve_report` notification**

```python
@router.post("/{report_id}/approve", response_model=ReportOut)
async def approve_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    # ... existing code ...
    # row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    
    # Fetch owner email
    owner = await db.fetchrow("SELECT email FROM users WHERE id = $1", row["user_id"])
    if owner and owner["email"]:
        background_tasks.add_task(
            send_email,
            owner["email"],
            f"Expense report approved: {row['title']}",
            f"Your expense report \"{row['title']}\" has been approved by {current_user['display_name']}."
        )
    # ...
```

- [ ] **Step 2: Implement `reject_report` notification**

```python
@router.post("/{report_id}/reject", response_model=ReportOut)
async def reject_report(
    report_id: int,
    background_tasks: BackgroundTasks,
    body: RejectBody = RejectBody(),
    current_user: dict = require_role("manager", "chef_finance"),
    db: asyncpg.Connection = Depends(get_db),
):
    # ...
    owner = await db.fetchrow("SELECT email FROM users WHERE id = $1", row["user_id"])
    if owner and owner["email"]:
        background_tasks.add_task(
            send_email,
            owner["email"],
            f"Expense report rejected: {row['title']}",
            f"Your expense report \"{row['title']}\" has been rejected. Reason: {body.reason}."
        )
    # ...
```

- [ ] **Step 3: Implement `pay_report` notification**

```python
@router.post("/{report_id}/pay", response_model=ReportOut)
async def pay_report(
    report_id: int, 
    background_tasks: BackgroundTasks,
    current_user: dict = require_role("chef_finance"), 
    db: asyncpg.Connection = Depends(get_db)
):
    # Need to fetch report details first to get user_id and title
    row = await db.fetchrow("SELECT * FROM expense_reports WHERE id = $1", report_id)
    # ...
    owner = await db.fetchrow("SELECT email FROM users WHERE id = $1", row["user_id"])
    if owner and owner["email"]:
        background_tasks.add_task(
            send_email,
            owner["email"],
            f"Expense report paid: {row['title']}",
            f"Your expense report \"{row['title']}\" has been marked as paid."
        )
    # ...
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pytest backend/tests/test_report_notifications.py -v`
Expected: ALL PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/routers/reports.py
git commit -m "feat: add approved, rejected, and paid notifications"
```
