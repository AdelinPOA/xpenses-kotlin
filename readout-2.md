## 1. Executive Architecture Summary

*   **Tech Stack & Core Patterns:** The system employs a monolithic, layered MVC backend architecture built on **Kotlin 2.1, Spring Boot 3.4.3, and JPA/Hibernate**. The frontend is a modern **Next.js 15 (React 19)** application utilizing TanStack Query for state management. The orchestration leans heavily on synchronous REST APIs, with early signs of sidecar microservices (OCR engines) integrated directly into the request lifecycle.
*   **System Health Score:** **6.5 / 10**. While the underlying technology choices are highly modern and robust, the application's execution suffers from severe data-fetching bottlenecks, structural violations of the Single Responsibility Principle (SRP) in the routing layer, and a failure to leverage the native rendering paradigms of its chosen frontend framework.
*   **Critical High-Level Observations:**
    1.  **Massive N+1 Database Bottlenecks:** DTO mapping on lazy-loaded collections triggers exponential query proliferation on paginated list endpoints.
    2.  **Fat Controller Anti-Pattern:** Business logic, transaction orchestration, and external API calls are heavily tangled inside monolithic Controller files, bypassing the Service layer.
    3.  **Frontend Paradigm Mismatch:** The Next.js 15 application is functioning as a legacy Single Page Application (SPA), blindly pushing all data fetching to the client browser instead of utilizing React Server Components (RSC) to reduce JS bundle weight and eliminate network waterfalls.

---

## 2. Deep-Dive Bottleneck Analysis

### A. Algorithmic Inefficiencies & Performance
*   **[eu/nt/xpenses/repositories/Repositories.kt]** -> **Severe N+1 Query Execution.** 
    The `findAllWithFilters` and `findAllWithFiltersPaged` queries in `ExpenseRepository` retrieve `Expense` entities without eagerly joining their associations. When `ExpenseMapper.kt` attempts to map these to `ExpenseOut` DTOs, it iterates over lazy-loaded fields (`user.displayName`, `category.name`, `receipts`). Fetching a page of 20 expenses results in 1 root query + 60 sub-queries. 
    *Impact:* Catastrophic degradation of database connection pool health and high latency under concurrent load.
*   **[eu/nt/xpenses/controllers/ExpenseController.kt]** -> **Redundant String/Date Casting.**
    Query parameters for date boundaries (`fromDate`, `toDate`) are received as raw `String` types and passed deeply into the repository layer. 
    *Impact:* Forces the database engine (PostgreSQL) to implicitly cast strings to timestamps on every row evaluated, negating potential index usage and increasing CPU overhead.

### B. Structural Friction & Code Duplication
*   **[eu/nt/xpenses/controllers/ReportController.kt (41KB)]** & **[ExpenseController.kt (30KB)]** -> **Fat Controller Anti-Pattern.** 
    These files are excessively monolithic, acting as routers, transaction managers, business logic evaluators, and persistence handlers (`expenseRepository.save()` is called directly inside controllers). 
    *Impact:* Highly tightly-coupled modules. It is nearly impossible to unit test the core report state machine logic without standing up a full MockMvc context. Reusability is zero.
*   **[frontend/app/admin/*/page.tsx]** -> **Repetitive Query Boilerplate.** 
    Extensive duplication of TanStack Query initialization (`const qc = useQueryClient()`) and layout rendering logic across 8 different admin sub-routes.

### C. Resource Management & Scale Inhibitors
*   **[eu/nt/xpenses/controllers/OcrController.kt]** -> **Synchronous Blocking I/O.** 
    Submitting receipts to the local Python `ocr-sidecar` or the external Gemini API is handled synchronously inside the Tomcat HTTP worker thread. 
    *Impact:* If an OCR scan takes 10 seconds to parse a complex PDF, the server thread is completely blocked. A minor spike in concurrent user uploads will immediately exhaust the Tomcat thread pool (default 200), resulting in cascading `503 Service Unavailable` errors.
*   **[eu/nt/xpenses/services/FxService.kt]** -> **Suboptimal Caching.** 
    FX rates are cached in PostgreSQL. Under heavy load (e.g., rendering the Dashboard for a whole company), hitting the database repeatedly for static daily exchange rates is a waste of DB I/O. 

### D. Modern Idiomatic Patterns & Maintainability
*   **[frontend/app/expenses/page.tsx] & [dashboard/page.tsx]** -> **Bypassing Next.js 15 Server Components.** 
    The frontend fetches entirely via client-side `useQuery` hooks. Next.js 15 App Router is explicitly designed for React Server Components (RSC) to handle initial data fetching. 
    *Impact:* The browser is forced to download the JS bundle, mount React, and then initiate an API waterfall, leading to a poor Time-to-Interactive (TTI) metric and bloated client execution.
*   **[JPA Models / Delete Endpoints]** -> **Hard Deletion.** 
    Financial records are currently hard-deleted via `repository.delete()`. 
    *Impact:* Loss of historical audit trails and violation of standard financial compliance best practices.

---

## 3. Prioritized Improvement Roadmap

| Priority | Component/File | Proposed Optimization | Expected ROI (Performance/Cleanliness) | Complexity (Low/Med/High) |
| :--- | :--- | :--- | :--- | :--- |
| **P0 (Immediate)** | `Repositories.kt` | Add `@EntityGraph` or `LEFT JOIN FETCH` to `ExpenseRepository.findAllWithFiltersPaged`. | Immediate ~80% reduction in DB queries; massive latency drop. | Low |
| **P0 (Immediate)** | `OcrController.kt` | Convert OCR scan endpoint to an asynchronous queued job (returning `202 Accepted`) using Spring's event publisher or a message broker. | Eliminates Tomcat thread exhaustion; scales to high concurrency. | Med |
| **P1 (High Impact)**| `*Controller.kt` | Extract all core persistence logic (`save()`, state changes) into `ExpenseService` and `ReportService`. | Massive boost to testability, SRP compliance, and code cleanliness. | Med |
| **P1 (High Impact)**| `frontend/app/*/page.tsx` | Refactor top-level page components to Next.js React Server Components; fetch initial data natively on the server. | Drastically reduces client JS bundle size; eliminates network waterfalls. | High |
| **P2 (Refactor)** | `Models.kt` | Implement `@SQLDelete` and `@Where(clause = "deleted = false")` for soft-deletes on Reports/Expenses. | Ensures strict financial data integrity and safe auditing. | Low |
| **P2 (Refactor)** | `ExpenseController.kt` | Strongly type Date request parameters using `@DateTimeFormat(iso = DateTimeFormat.ISO.DATE)`. | Minor query execution speedup; eliminates hidden runtime cast errors. | Low |

---

## 4. Claude Code Implementation Blueprint

When passing this roadmap to Claude Code, use the following execution directives to ensure precise, production-grade refactors:

**Directive 1: Fix N+1 Queries (P0)**
> "Claude, open `Repositories.kt`. Locate the `findAllWithFiltersPaged` method in `ExpenseRepository`. Decorate it with `@EntityGraph(attributePaths = ["user", "category", "receipts"])`. Run the backend tests to ensure the pagination query still behaves correctly without raising `MultipleBagFetchException`. If it does, refactor to use a single `LEFT JOIN FETCH` with `BatchSize` on the collections."

**Directive 2: Fat Controller Extraction (P1)**
> "Claude, open `ReportController.kt`. Extract all logic inside the `approveReport`, `rejectReport`, and `payReport` endpoints. Create a new `ReportWorkflowService.kt` and inject it. The controller methods should be reduced to 3-5 lines, strictly handling HTTP Request/Response mapping. Watch out for `@Transactional` boundaries moving from the controller to the service."

**Directive 3: Next.js RSC Migration (P1)**
> "Claude, open `frontend/app/dashboard/page.tsx`. Remove the client-side `'use client'` directive if present, and remove the TanStack `useQuery` hook for `DashboardStats`. Refactor the component to an `async function DashboardPage()`, using standard native `await fetch()` pointing to the `INTERNAL_API_URL`. Ensure you configure appropriate `next.revalidate` caching settings. Watch out for missing cookies headers in the server-side fetch."

**Directive 4: Asynchronous OCR Unblocking (P0)**
> "Claude, open `OcrController.kt`. Refactor the `scanReceipt` POST endpoint. Instead of waiting for the sidecar, immediately save the receipt state as `PROCESSING`, fire a Spring `@Async` event or coroutine to handle the actual HTTP call to the OCR engine, and immediately return a `202 Accepted` to the client. The frontend can be updated later to poll for completion."
