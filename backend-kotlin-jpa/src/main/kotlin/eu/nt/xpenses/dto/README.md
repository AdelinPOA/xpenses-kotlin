# DTO Packages

## Overview
Domain-grouped request and response data transfer objects (`eu.nt.xpenses.dto.*`) used across backend REST controllers, mappers, and services. No direct source files reside in this directory.

## Subdirectories & Boundaries
- `auth`: [./auth/README.md](./auth/README.md) - Login and password change request DTOs with field validation constraints.
- `dashboard`: [./dashboard/README.md](./dashboard/README.md) - Technician and manager dashboard KPI, category spend, pending summary, and activity feed response DTOs.
- `expense`: [./expense/README.md](./expense/README.md) - Expense creation/update/review correction payloads, receipt DTOs, and bulk upload outcome DTOs.
- `ocr`: [./ocr/README.md](./ocr/README.md) - OCR job recovery state responses and manual completion override payloads.
- `report`: [./report/README.md](./report/README.md) - Report, advance payment, mileage record, bulk status, and SAP/delegation order import preview DTOs.
- `search`: [./search/README.md](./search/README.md) - Cross-entity search result wrapper for reports and expenses.
- `settings`: [./settings/README.md](./settings/README.md) - System configuration DTOs for allowances, mobile UI flags, mileage tax rates, FX margins/providers, OCR chains, SMTP/IMAP, and ingestion retry/simulation.
- `user`: [./user/README.md](./user/README.md) - User creation, profile update, role/activation mutation, and user response DTOs.
