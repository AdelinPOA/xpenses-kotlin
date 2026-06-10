## Why

Managers and CFOs need a consolidated, context-rich overview of technician expense reports and profiles to streamline auditing, verify receipts, and perform financial reviews without navigating back and forth between multiple pages.

## What Changes

- Add a generic, read-only "User Profile" view accessible by privileged roles (Managers and CFOs) at `/profile/[id]`.
- Add a "User Reports" tab inside the profile view showing all reports belonging to the target technician, filtered by status.
- Add a direct report detail modal or link to review report details directly from the profile's report list.
- Create a team roster directory page ("Users" or "Staff") accessible by Managers, CFOs, and Moderators to find and navigate to technician profiles.
- Support clickable user names on report list tables (in Approvals and Payments pages) that link to the respective user's profile.

## Capabilities

### New Capabilities
- `user-profiles-reports-view`: Allow Managers and CFOs to view a user directory, access read-only technician profiles, and see all reports of a specific technician with inline detail review.

### Modified Capabilities
<!-- No requirement changes to existing specs -->

## Impact

- **Backend**:
  - `GET /api/reports`: Add `user_id` query parameter allowing filtering by a specific user (restricted to `chef_finance`, `manager`, or `mod`).
  - `GET /api/users/{id}`: Extend permission logic to allow Managers and CFOs to view basic profile info of other users (username, display name, email, role, activity status).
- **Frontend**:
  - Add page `/profile/[id]` (reusable profile view).
  - Add staff directory page `/admin/users` (or a shared `/users` team list page) accessible by Manager, CFO, and Moderator.
  - Link technician name elements in table rows on `/approvals` and `/payments` pages to `/profile/[id]`.
