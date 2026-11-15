# UI Components

## Overview
Reusable primitive UI components for status/role badges, empty states, query error recovery banners, and debounced global search autocomplete.

## Interface
- `[Badge.tsx:"use client"]` — Client component directive.
- `[Badge.tsx:Badge]` — Default-exported function `Badge({ status, type = "status" }: { status: string; type?: "status" | "role" }): JSX.Element`.
- `[EmptyState.tsx:EmptyStateProps]` — Exported interface `{ message?: string; actionLabel?: string; onAction?: () => void; icon?: React.ElementType }`.
- `[EmptyState.tsx:EmptyState]` — Default-exported function `EmptyState({ message = "No items found", actionLabel, onAction, icon: Icon = Inbox }: EmptyStateProps): JSX.Element`.
- `[QueryErrorNotice.tsx:"use client"]` — Client component directive.
- `[QueryErrorNotice.tsx:QueryErrorNoticeProps]` — Internal type `{ isFetching: boolean; onRetry: () => void }`.
- `[QueryErrorNotice.tsx:QueryErrorNotice]` — Default-exported function `QueryErrorNotice({ isFetching, onRetry }: QueryErrorNoticeProps): JSX.Element`.
- `[SearchDropdown.tsx:"use client"]` — Client component directive.
- `[SearchDropdown.tsx:SearchDropdownProps]` — Internal interface `{ className?: string }`.
- `[SearchDropdown.tsx:SearchDropdown]` — Default-exported function `SearchDropdown({ className }: SearchDropdownProps): JSX.Element`.

## Invariants
- `[Badge.tsx:Badge]` Translates `status` via `useTranslations("common")` only when `type === "status"` and `status` is in `STATUS_KEYS` (`draft`, `submitted`, `approved`, `rejected`, `paid`, `active`, `inactive`); translates `role` via `useTranslations("admin")` only when `type === "role"` and `ROLE_KEYS[status]` exists (`technician`, `manager`, `chef_finance`, `mod`); otherwise falls back to `status.replace("_", " ")` and default gray styling.
- `[EmptyState.tsx:EmptyState]` Renders the action button (`type="button"`) only when both `actionLabel` and `onAction` are truthy; renders the icon with `aria-hidden="true"` (defaults to `Inbox`) and `message` (defaults to `"No items found"`).
- `[QueryErrorNotice.tsx:QueryErrorNotice]` Renders an alert container with `role="alert"` and localized `common.load_failed` / `common.try_again` strings; disables the retry button and sets `aria-busy={isFetching}` whenever `isFetching` is `true`.
- `[SearchDropdown.tsx:SearchDropdown]` Debounces `term` into `debouncedTerm` by `300ms` and resets `selectedIndex` to `-1`.
- `[SearchDropdown.tsx:SearchDropdown]` Enables React Query (`queryKey: searchKeys.query(debouncedTerm)`, `staleTime: 30_000`) and displays the listbox dropdown (`showDropdown`) only when `debouncedTerm.length >= 2` (and `isOpen` is `true` for dropdown visibility).
- `[SearchDropdown.tsx:SearchDropdown]` Filters out empty result groups (`group.items.length > 0`), caps displayed items per group at `5` (`group.items.slice(0, 5)`), and shows the `"see_all_results"` button only when data exists and `results.length > 10`.
- `[SearchDropdown.tsx:handleKeyDown]` `ArrowDown`/`ArrowUp` clamp `selectedIndex` within `[-1, results.length - 1]`; `Enter` selects `results[selectedIndex]` if `selectedIndex >= 0`, otherwise invokes `handleSeeAll` if `debouncedTerm` is truthy; `Escape` closes the dropdown.

## Side Effects
- `[EmptyState.tsx:EmptyState]` Invokes `onAction()` callback when the rendered action button is clicked.
- `[QueryErrorNotice.tsx:QueryErrorNotice]` Invokes `onRetry()` callback when the retry button is clicked.
- `[SearchDropdown.tsx:SearchDropdown]` Schedules and clears a `300ms` `setTimeout` debounce timer whenever `term` changes.
- `[SearchDropdown.tsx:SearchDropdown]` Performs HTTP `GET /search?q=<debouncedTerm>` via `api.get` inside `useQuery` when enabled.
- `[SearchDropdown.tsx:SearchDropdown]` Attaches and removes a `document` `"mousedown"` listener to close the dropdown (`setIsOpen(false)`) on clicks outside `dropdownRef` and `inputRef`.
- `[SearchDropdown.tsx:handleSelect]` Resets `term` and dropdown open state, then navigates via `router.push` to `/reports/${id}`, `/expenses/${id}`, `/profile/${id}`, `/insurance`, `/reports/${reportId}/advances`, or `/advances`.
- `[SearchDropdown.tsx:handleSeeAll]` Closes the dropdown and navigates via `router.push(\`/search?q=${encodeURIComponent(debouncedTerm)}\`)`.
- `[SearchDropdown.tsx:handleKeyDown]` Blurs `inputRef.current` on `Escape`.

## Verification
- Run: `cd frontend && npm run typecheck && npm run i18n:check && npm run lint`
