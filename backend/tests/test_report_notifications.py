from unittest.mock import AsyncMock, patch

import pytest

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
        # We need to find the call to manager1 or cfo1
        manager_call = next(call for call in mock_send.call_args_list if call.args[0] == "maria.ionescu@nt-automation.eu")
        subject = manager_call.args[1]
        content = manager_call.args[2]
        assert "New expense report submitted: Monthly Trip" == subject
        assert "Ion Popescu" in content
        assert "Monthly Trip" in content

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
    from tests.conftest import login as login_helper
    from tests.conftest import new_client
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
    from tests.conftest import login as login_helper
    from tests.conftest import new_client
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
    
    from tests.conftest import login as login_helper
    from tests.conftest import new_client
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
