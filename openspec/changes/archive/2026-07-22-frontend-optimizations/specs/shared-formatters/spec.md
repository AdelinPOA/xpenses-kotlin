## ADDED Requirements

### Requirement: Cached currency formatter module
The system SHALL provide a `lib/format.ts` module exporting `formatEur(amount: number): string` and `formatAmount(amount: number, currency: string): string` functions that use cached `Intl.NumberFormat` instances.

#### Scenario: EUR formatting uses singleton
- **WHEN** `formatEur(1234.56)` is called from any component
- **THEN** the function returns `"€1,234.56"` using a module-level cached `Intl.NumberFormat` instance (not a new instance per call)

#### Scenario: Multi-currency formatting uses cache map
- **WHEN** `formatAmount(100, "USD")` is called multiple times
- **THEN** the system reuses the same `Intl.NumberFormat` instance from an internal `Map<string, Intl.NumberFormat>` cache

### Requirement: All local format helpers removed
All page and component files SHALL import `formatEur` or `formatAmount` from `@/lib/format` instead of defining local `function formatEur` / `function formatAmount` / `function formatLimit` helpers.

#### Scenario: No duplicate formatters exist
- **WHEN** a developer searches the codebase for `new Intl.NumberFormat`
- **THEN** the only occurrence is in `lib/format.ts`
