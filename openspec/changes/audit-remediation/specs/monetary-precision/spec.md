## ADDED Requirements

### Requirement: Monetary amounts use fixed-precision decimals

The system SHALL represent every persisted monetary amount as `BigDecimal` (never `Double`/`Float`) across all JPA entities — including expense amounts, EUR-converted amounts, advance amounts, mileage amounts, and report totals. Each monetary column SHALL declare an explicit precision and `scale = 2` (or the currency-appropriate scale), consistent with the existing `taxAmount: BigDecimal` field.

#### Scenario: Decimal amount round-trips without drift

- **WHEN** an amount such as `0.10 + 0.20` is computed and persisted
- **THEN** the stored and re-read value SHALL equal `0.30` exactly, with no binary floating-point drift

#### Scenario: Persisted scale is fixed

- **WHEN** a monetary value is written to the database
- **THEN** it SHALL be stored with the column's declared fixed scale and SHALL NOT silently truncate or extend precision

### Requirement: Monetary arithmetic preserves precision end-to-end

The system SHALL perform FX conversion, totals aggregation, and daily-allowance/mileage computation using `BigDecimal` arithmetic with explicit rounding (`RoundingMode`), so no intermediate step downcasts to a binary floating-point type.

#### Scenario: Report total is exact

- **WHEN** a report total is computed by summing its expense and advance amounts
- **THEN** the total SHALL be the exact `BigDecimal` sum at the declared scale, independent of element ordering

#### Scenario: FX conversion uses decimal rounding

- **WHEN** an amount is converted to EUR using a fetched rate
- **THEN** the conversion SHALL use `BigDecimal` multiplication with an explicit `RoundingMode` and store a value at the EUR scale
