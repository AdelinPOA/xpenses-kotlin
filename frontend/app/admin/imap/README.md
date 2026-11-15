# Admin IMAP Route (`frontend/app/admin/imap`)

## Overview
Next.js App Router client route (`/admin/imap`) enabling moderators to configure IMAP email ingestion settings, test IMAP connectivity, inspect and retry failed or pending email ingestion recovery records, and run email delegation ingestion simulations.

## Interface
- `[page.tsx:ImapAdminPage]` — Default-exported client route component for `/admin/imap`.
- `[page.tsx:DelegationFields]` — Internal helper component rendering parsed delegation fields from `EmailSimulationParsed`.
- `[page.tsx:FormState]` — Local form type `Omit<ImapConfig, "imap_port"> & { imap_port: string }`.
- `[page.tsx:DEFAULT_FORM]` — Default `FormState` (`enabled: false`, `imap_port: "993"`, `imap_folder: "INBOX"`, `password_set: false`).
- `[page.tsx:imapConfigSchema]` — Zod schema validating `FormState`.
- `[page.tsx:MOCK_DELEGATION_EMAIL]` — German job delegation sample email template string for simulation.

## Invariants
- Role and auth guard: redirects non-`mod` or unauthenticated users to `/dashboard` once `!loading`, renders `null` if `!user || user.role !== "mod"`, and gates all queries with `enabled: user?.role === "mod"` `[page.tsx:ImapAdminPage]`.
- Config validation: `imap_port` must parse as an integer in `[1, 65535]`, `imap_folder` requires `min(1)`, and when `enabled` is `true`, `imap_host.trim().length > 0` and `imap_user.trim().length > 0` are required `[page.tsx:imapConfigSchema]`.
- Password preservation: loading config resets `imap_pass` to `""` and `pwChanged` to `false`; `onSubmit` and `handleTest` send `imap_pass` only when `pwChanged` is `true` `[page.tsx:ImapAdminPage]`.
- Recovery filtering and retry gating: `actionableRecovery` retains items where `status !== "PROCESSED" || acknowledgement_status === "PENDING"`; retry renders only for `status === "FAILED"`, `status === "REJECTED"`, or `acknowledgement_status === "PENDING"` `[page.tsx:ImapAdminPage]`.
- Simulation guards: `handleSimulate` requires non-empty trimmed sender (`customSenderEmail` when `selectedSenderEmail === "custom"`, else `selectedSenderEmail`) and non-empty trimmed `simulationBody`; sender dropdown lists only `usersData` entries with `u.is_active && u.email` `[page.tsx:handleSimulate, page.tsx:ImapAdminPage]`.
- AI parse fallback & empty guard: `aiParsed`/`aiError` fall back from `ai_parsed`/`ai_error` to `gemini_parsed`/`gemini_error`; `DelegationFields` returns `null` when `parsed` is nullish or all 10 mapped delegation fields are empty `[page.tsx:ImapAdminPage, page.tsx:DelegationFields]`.

## Side Effects
- API queries: `GET /settings/imap` (`imapKeys.config()`), `getImapIngestionRecovery` (`["imap-ingestion-recovery"]`, `staleTime: 15_000`), and `GET /users` (`["users-list-sim"]`) `[page.tsx:ImapAdminPage]`.
- API mutations/requests: `PATCH /settings/imap` (`saveMutation`, invalidating `imapKeys.all`), `retryImapIngestion(item.message_key)` (`retryIngestionMutation`, invalidating `["imap-ingestion-recovery"]`), `POST /settings/imap/test` (`handleTest`), and `simulateEmailIngestion` (`handleSimulate`) `[page.tsx:saveMutation, page.tsx:retryIngestionMutation, page.tsx:handleTest, page.tsx:handleSimulate]`.
- Navigation & logging: `router.replace("/dashboard")` on unauthorized access, `<Link>` targets to `/admin/ocr`, `/reports/${item.expense_report_id}`, and `/reports/${simulationResult.report_id}`, toast notifications, and `console.error` in `handleSimulate` `[page.tsx:ImapAdminPage, page.tsx:handleSimulate]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
