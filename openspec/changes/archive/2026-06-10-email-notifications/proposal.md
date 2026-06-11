## Why

Currently, there are no notifications in the system when an expense report undergoes state transitions (e.g., when a technician submits a report, or when a manager approves, rejects, or pays a report). Without automated notifications, users must manually log in and poll the application dashboard to discover actions pending their attention, causing delays in reimbursement cycles. Implementing email notifications resolves this bottleneck.

## What Changes

- Automatically send transactional emails to relevant stakeholders on specific report state transitions:
  - **Submit Report**: Notify the technician's manager (or all managers if no manager is designated) that a report is awaiting approval.
  - **Approve Report**: Notify the submitter (technician) that their report has been approved and is awaiting payment by the CFO.
  - **Reject Report**: Notify the submitter (technician) that their report was rejected, displaying the manager's rejection reason.
  - **Pay Report**: Notify the submitter (technician) that their report has been paid.
- Ensure email delivery executes asynchronously, leveraging the existing configuration details retrieved from `app_settings` and `email_service.py`.
- **User Settings Toggle**: Add a database attribute and a frontend toggle on the `/profile` page allowing individual users to turn their email notifications ON or OFF.

## Capabilities

### New Capabilities
- `email-notifications`: Implement dynamic, templated transactional email alerts triggered by backend report lifecycle actions, with a user-facing toggle to subscribe/unsubscribe.

### Modified Capabilities
<!-- None -->

## Impact

- **Database**: Add `notifications_enabled` BOOLEAN field to `users`.
- **Backend**:
  - `backend/xpenses/routers/reports.py`: Add email triggers during status transitions, conditional on the user's preference.
  - `backend/xpenses/routers/users.py`: Add an endpoint to allow users to update their profile settings.
  - `backend/xpenses/services/email_service.py`: Add templates for report-state-change emails.
- **Frontend**:
  - `frontend/app/profile/page.tsx`: Add a preference checkbox/toggle to subscribe/unsubscribe from email alerts.
- **Dependencies**: Uses existing `aiosmtplib` and email services.
