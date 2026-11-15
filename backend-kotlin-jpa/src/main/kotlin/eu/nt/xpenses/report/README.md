# Report Subsystem

## Overview
Domain-focused report workflows in `eu.nt.xpenses.report`, separating transactional report lifecycle transitions from review queue querying. No direct source files reside in this directory.

## Subdirectories & Boundaries
- `lifecycle`: [./lifecycle/README.md](./lifecycle/README.md) - Transactional `ExpenseReportLifecycle` state machine, commands/events, and async email notification adapter.
- `review`: [./review/README.md](./review/README.md) - Manager/finance review queue reader (`ReviewQueueReader`), projection, and queue item DTO.
