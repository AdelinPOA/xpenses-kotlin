# Database Resources (`db`)

## Overview
Groups database-related Spring Boot resources, currently containing the Flyway SQL DDL migration scripts that define and evolve the PostgreSQL schema.

## Subdirectories & Boundaries
- `migration`: [`./migration/README.md`](./migration/README.md) - Versioned Flyway SQL DDL migrations (`V1__init.sql` through `V110__fuel_prices_and_mileage_source.sql`) defining tables, constraints, indexes, and migration data resets/backfills.
