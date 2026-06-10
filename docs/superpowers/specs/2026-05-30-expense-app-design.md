# Design Spec: Small Business Expense Manager (Zoho Clone)
**Date:** 2026-05-30
**Status:** Approved

## 1. Overview
A professional expense management application tailored for small businesses. It allows employees to capture receipts via OCR, manages multi-currency conversions, and provides a simple approval/reimbursement workflow.

## 2. Technical Stack
- **Frontend:** Next.js (TypeScript, Tailwind CSS)
- **Backend:** FastAPI (Python 3.11+)
- **Database:** PostgreSQL
- **OCR Engine:** LLM-based (e.g., GPT-4o-mini or Claude 3 Haiku via API)
- **Exchange Rates:** External API (e.g., ExchangeRate-API or Open Exchange Rates)
- **Storage:** Local filesystem (development) or S3-compatible (production)

## 3. Core Features

### 3.1 Smart Receipt Capture (OCR)
- **Action:** User uploads a photo of a receipt.
- **Processing:** Backend sends image to an LLM with a structured prompt.
- **Extraction:** Automatically extracts Merchant Name, Total Amount, Date, Currency, and Category.
- **Verification:** User reviews and confirms extracted data before saving.

### 3.2 Multi-Currency Engine
- **Base Currency:** Admin sets a company-wide base currency (e.g., USD).
- **Conversion:** When a foreign expense is added (e.g., EUR), the system fetches the historical exchange rate for the receipt date.
- **Reporting:** All dashboards show totals in the Base Currency for consistent analytics.

### 3.3 Reimbursement Workflow
- **Roles:**
    - **Employee:** Can create, view, and edit their own expenses.
    - **Admin/Manager:** Can view all expenses, approve/reject them, and mark them as "Paid".
- **Statuses:** `Draft` -> `Pending Approval` -> `Approved` -> `Reimbursed (Paid)`.

## 4. Architecture
- **API First:** FastAPI provides a RESTful API for all frontend actions.
- **Authentication:** Integrated with Company **Active Directory** (via OIDC or SAML).
    - Users are automatically provisioned in the local database upon first login.
    - Roles (`Employee`, `Admin`) are mapped from AD Groups if possible.
- **Data Model:**
    - `Users` (id, email, external_id, role) - *Note: No password_hash stored locally.*
    - `Expenses` (id, user_id, merchant, amount, currency, base_amount, date, status, receipt_url, category)

## 5. Success Criteria
- Receipt data extraction accuracy > 90% using LLM.
- Correct base-currency calculation for all foreign expenses.
- Clear separation of duties between Employees and Admins.
