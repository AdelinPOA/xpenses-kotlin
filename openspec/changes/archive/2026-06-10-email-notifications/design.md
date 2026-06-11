## Context

The system has an existing `email_service.py` with `send_email(to_email, subject, content)` which queries configuration dynamically from the database (`app_settings` via `email_settings_service`). However, this is not hooked up to any business events. Adding email alerts triggers on report transitions (submitted, approved, rejected, paid) will notify managers of pending work and technicians of approval status.

## Goals / Non-Goals

**Goals:**
- Add asynchronous helper tasks to compose and send emails using the existing `send_email` infrastructure.
- Trigger emails from `backend/xpenses/routers/reports.py` inside status transition endpoints.
- Support fallback mechanisms if the submitter does not have an assigned manager (falls back to sending to all users with the role `manager`).
- Add user-level `notifications_enabled` setting in database and user endpoints.
- Update UI on `/profile` page with the notifications setting switch.

**Non-Goals:**
- Custom email client settings page (already built).
- Retrying failed email delivery in a message queue (keep it simple using `asyncio.create_task` or inline awaits that gracefully catch exceptions).

## Decisions

### Decision 1: Email Execution Flow
- **Choice**: Call the template utility and run `send_email` inline or wrap it in a background helper inside the endpoint handlers.
- **Rationale**: Since `send_email` is fully asynchronous using `aiosmtplib`, awaiting it in endpoints or spawning it with `asyncio.create_task` avoids blocking the FastAPI thread loop. We will run it inline/awaited to allow test assertions, wrapped in try-catch to ensure email configuration errors do not crash the primary HTTP API response (e.g. failing to connect to SMTP shouldn't prevent a report from being approved).

### Decision 2: Fallback for No Assigned Manager
- **Choice**: Query all users with the `manager` role in the database when the report submitter has no manager assigned.
- **Rationale**: Avoids silent failures where reports get lost in the queue because a technician was not explicitly linked to a manager in their profile.

### Decision 3: Notification Preference Storage
- **Choice**: Add a `notifications_enabled` BOOLEAN field (default TRUE) directly to the `users` table.
- **Rationale**: Simple, performant, and maps cleanly to the existing `UserOut` schemas returned when querying profile information.

## Risks / Trade-offs

- **Risk**: Invalid SMTP credentials block user actions.
  - **Mitigation**: All transactional email dispatches must be wrapped in `try-except` blocks. Any errors during email connection or rendering must log a warning but let the HTTP status update succeed.
- **Risk**: Database migrations require schema reset.
  - **Mitigation**: Perform a `CREATE TABLE IF NOT EXISTS` check or execute an `ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE` in `init_db`.
