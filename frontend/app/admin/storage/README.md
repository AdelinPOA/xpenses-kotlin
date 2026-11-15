# Admin Storage Route (`frontend/app/admin/storage`)

## Overview
Next.js App Router client route (`/admin/storage`) allowing moderators to configure receipt storage backends (`local`, `smb`, `webdav`, `sftp`, `s3`), test backend connectivity, trigger receipt migration when changing settings, and monitor live migration progress.

## Interface
- `[page.tsx:StorageAdminPage]` — Default-exported client route component rendering the storage backend configuration form, test action, migration progress card, and confirmation modal inside `AppShell`.
- `[page.tsx:FormState]` — Local type alias for `StorageConfig`.
- `[page.tsx:DEFAULT_FORM]` — Default `StorageConfig` (`provider_type: "local"`, default nested configs for `local`, `smb`, `webdav`, `sftp`, `s3`).

## Invariants
- Role and auth guard: redirects to `/dashboard` when `!loading && (!user || user.role !== "mod")`, renders `null` when `!user || user.role !== "mod"`, and enables `storageKeys.config()` and `storageKeys.migration()` queries only when `!!user && user.role === "mod"` `[page.tsx:StorageAdminPage]`.
- Migration polling & progress guard: `storageKeys.migration()` polls every `2000ms` only while `status === "running"`; the live migration progress card renders only when `migrationStatus?.status === "running"` and guards progress division with `migrationStatus.total_files || 1` `[page.tsx:StorageAdminPage]`.
- Hydration fallback: form reset supplies default nested objects if `local`, `smb`, `webdav`, `sftp`, or `s3` on loaded `config` is falsy `[page.tsx:StorageAdminPage]`.
- Migration confirmation guard: `handleFormSubmit` defers saving and opens `showMigrateModal` with `pendingFormData` whenever `(config && config.provider_type !== data.provider_type) || isDirty`; `handleConfirmMigration` mutates only when `pendingFormData` is non-null `[page.tsx:handleFormSubmit, page.tsx:handleConfirmMigration]`.
- Test button guard: Test Connection button is disabled while `testing` is `true` `[page.tsx:StorageAdminPage]`.

## Side Effects
- API read & polling: calls `getStorageConfig` (`staleTime: 300_000`, `gcTime: 600_000`) and `getStorageMigrationStatus` (2s polling while `"running"`) `[page.tsx:StorageAdminPage]`.
- API mutations/requests: `updateStorageConfig(data, migrate)` (`saveMutation`, invalidating `storageKeys.all` and showing toast notifications) and `testStorageConfig(watch())` (`executeTest`, updating `testResult` and showing toast notifications) `[page.tsx:saveMutation, page.tsx:executeTest]`.
- Form state reset on `config` change and client-side redirect via `router.replace("/dashboard")` for unauthorized users `[page.tsx:StorageAdminPage]`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
