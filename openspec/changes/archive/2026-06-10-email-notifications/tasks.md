## 1. Schema & Service Enhancements

- [x] 1.1 Add `notifications_enabled` column to `users` table in `backend/xpenses/database.py` (via `ALTER TABLE users ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN DEFAULT TRUE`).
- [x] 1.2 Update the `UserOut` model in `backend/xpenses/models.py` and query responses in auth and user endpoints to support `notifications_enabled`.
- [x] 1.3 Add email template templates/strings helper inside `backend/xpenses/services/email_service.py` to construct HTML/text emails dynamically for Submission, Approval, Rejection, and Payment actions.
- [x] 1.4 Implement helper method to query managers associated with a user or find all managers in the system if no manager is assigned to the submitter.

## 2. API Lifecycle & Preference Integrations

- [x] 2.1 Add `/api/users/me` PATCH/PUT user preference endpoint in `backend/xpenses/routers/users.py` to allow users to update their `display_name` and `notifications_enabled` preferences.
- [x] 2.2 Integrate transactional email notifications inside report submission endpoint in `backend/xpenses/routers/reports.py` (notify manager(s) - conditional on manager's preference).
- [x] 2.3 Integrate email notifications inside report approval endpoint in `backend/xpenses/routers/reports.py` (notify submitter - conditional on preference).
- [x] 2.4 Integrate email notifications inside report rejection endpoint in `backend/xpenses/routers/reports.py` (notify submitter with rejection reason - conditional on preference).
- [x] 2.5 Integrate email notifications inside report payment endpoint in `backend/xpenses/routers/reports.py` (notify submitter - conditional on preference).

## 3. Frontend Integration

- [x] 3.1 Update the `User` type in `frontend/lib/api.ts` to include `notifications_enabled`.
- [x] 3.2 Add a checkbox/toggle input for "Email Notifications" on `/profile/page.tsx` linked to the `/users/me` PATCH mutation to save settings.

## 4. Unit & Integration Tests

- [x] 4.1 Create mock tests inside the test suite validating that emails are sent correctly during submission, approval, rejection, and payment actions, and that they are skipped if `notifications_enabled` is set to FALSE.
