## Context

Currently, the frontend and backend enforce that reports and profile details are heavily segregated by role. Managers and CFOs can review submissions and process payments, but they cannot inspect a technician's specific profile or easily filter reports list by user. They need a unified directory view and user report overview for auditing.

## Goals / Non-Goals

**Goals:**
- Provide a Staff Directory available to Managers, CFOs, and Mods.
- Provide a read-only Profile page at `/profile/[id]` for managers and CFOs to view technician info and user report lists.
- Support opening a report detail modal directly from the profile's report history tab.
- Support user filtering on backend reports endpoint (`GET /api/reports?user_id=X`).

**Non-Goals:**
- Letting Managers or CFOs edit technician profile details (passwords, emails, or names). That remains restricted to Moderators under the `/admin/users` screen.
- Letting Managers approve or reject reports inline on the profile list page (instead, clicking opens a detail review modal/view).

## Decisions

### 1. Unified Profile Routing
- **Choice**: Re-use `/profile/page.tsx` for self-profile, but create a dynamic route `/profile/[id]/page.tsx` to handle viewing other users' profiles.
- **Rationale**: Keeps self-profile and foreign-profile concerns distinct. `/profile/[id]` loads the specified user context and displays it in read-only form if the user is a manager or CFO.

### 2. User Filtering in Reports Query
- **Choice**: Add an optional `user_id` query parameter to `GET /api/reports`.
- **Rationale**: Avoids having to fetch all reports on the frontend and filter client-side, which would be inefficient.

### 3. Sharing the `/admin/users` Page
- **Choice**: Instead of creating a new page `/users` for the staff roster, we will make `/admin/users` viewable by Managers, CFOs, and Mods. For Managers and CFOs, all "Edit" and "Create" controls will be hidden, turning the page into a read-only team directory.
- **Rationale**: Avoids code duplication and leverages the existing user fetch and listing logic.

## Risks / Trade-offs

- **Risk**: Unauthorized users reading details of other users.
  - **Mitigation**: Strictly gate the `GET /api/users/{id}` and `GET /api/reports?user_id=X` endpoints at the backend router level using FastAPIs dependencies (`require_role`).
