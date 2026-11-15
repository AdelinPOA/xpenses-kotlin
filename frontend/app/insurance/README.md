# Insurance Route (`frontend/app/insurance`)

## Overview
Next.js App Router client route (`/insurance`) for viewing, downloading, uploading, and deleting technician insurance documents.

## Interface
- `[page.tsx:InsurancePage]` — Default-exported client route component rendering the insurance documents list, scope toggle, upload modal, and download/delete actions inside `AppShell`.

## Invariants
- Manager capability guard: `isManager` requires `user?.role` in `["manager", "chef_finance", "mod"]` and gates the `showAll` toggle, upload modal trigger, and per-file delete controls `[page.tsx:isManager]`.
- Technician list gating: `["insurance-users"]` query is enabled only when `isManager && showUpload`, and dropdown options filter users to `u.role === "technician"` `[page.tsx:users]`.
- Upload validation: `handleUpload` blocks mutation unless `formTitle.trim()`, `formFile`, and `formUserId` are truthy; `uploadMutation` throws `"No file selected"` if `!formFile` and appends `description` only when truthy; modal inputs enforce HTML `required` on technician, title, and file `[page.tsx:handleUpload, page.tsx:uploadMutation, page.tsx:showUpload]`.
- Formatting & download fallbacks: `formatSize` returns `"—"` for `null` or `0`; `handleDownload` falls back to `"document"` when `file.file_name` is falsy `[page.tsx:formatSize, page.tsx:handleDownload]`.

## Side Effects
- Queries `GET /insurance` (`params: { all: showAll }`, `insuranceKeys.list({ all: showAll })`) and `GET /users` (`["insurance-users"]`) `[page.tsx:files, page.tsx:users]`.
- Mutations: `POST /insurance` multipart `FormData` (`uploadMutation`) and `DELETE /insurance/${id}` (`deleteMutation`), invalidating `insuranceKeys.all` and showing toast notifications `[page.tsx:uploadMutation, page.tsx:deleteMutation]`.
- Triggers file download via `downloadBlob(`/insurance/${file.id}/download`, {}, file.file_name || "document")` `[page.tsx:handleDownload]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
