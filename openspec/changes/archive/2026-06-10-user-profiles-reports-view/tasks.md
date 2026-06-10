## 1. Backend Route Updates

- [x] 1.1 Support `user_id` query parameter in `GET /api/reports` endpoint inside `backend/xpenses/routers/reports.py`.
- [x] 1.2 Add authorization check in `GET /api/reports` to ensure technicians cannot request other users' reports.
- [x] 1.3 Update route handler permission check for `GET /api/users/{id}` inside `backend/xpenses/routers/users.py` to allow managers and CFOs to access other users' details.
- [x] 1.4 Write integration tests in `backend/tests/test_user_profiles_reports.py` verifying security gates and user report retrieval.

## 2. Frontend Navigation & Shared User Directory

- [x] 2.1 Update sidebar navigation roles filter for `/admin/users` (or configure `/users` route) to show the directory link for Managers and CFOs.
- [x] 2.2 Add read-only conditional state to `/admin/users/page.tsx` when accessed by a Manager or CFO (hiding create/edit buttons, passwords, and actions).
- [x] 2.3 Add clickable profile links on names in the table listings inside `/admin/users/page.tsx`, `/approvals/page.tsx`, and `/payments/page.tsx`.

## 3. Profile Page Dynamic View

- [x] 3.1 Create `/profile/[id]/page.tsx` matching `/profile/page.tsx` but loading the dynamic user info instead of `users/me` if an ID is present.
- [x] 3.2 Add a tab control to the dynamic profile view separating "Account Info" and "User Reports".
- [x] 3.3 Fetch the target user's report list in "User Reports" tab via `GET /api/reports?all=true&user_id={id}`.
- [x] 3.4 Support clicking on reports to open a detail view/modal showing receipt details and approval status.
