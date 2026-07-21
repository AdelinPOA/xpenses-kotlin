# Graph Report - xpenses-kotlin  (2026-07-21)

## Corpus Check
- 218 files · ~150,980 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1799 nodes · 3187 edges · 136 communities (105 shown, 31 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 153 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `1e83a514`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- Findallbyuserid Components
- Httpservletrequest Components
- Bulkexpensecontroller Components
- Appsettingscontroller Components
- Spec Components
- Page Components
- Any Components
- Page Components
- Page Components
- React Components
- Inventorycontroller Components
- Page Components
- Cacheconfig Components
- Page Components
- Datainitializer Components
- Sidebar Components
- 400 Components
- Ldapservice Components
- Validationexceptionhandler Components
- Mileagecontroller Components
- Paths Components
- Insurancecontroller Components
- Ocrservice Components
- Ocrcontroller Components
- Emailimportservice Components
- Reportservice Components
- Authcontroller Components
- 200 Components
- Fxservice Components
- Contextloadstest Components
- Categorycontroller Components
- Cryptoservice Components
- Securityconfig Components
- 400 Components
- Page Components
- Color Components
- Exportservice Components
- Mileagecontrollertest Components
- Ocrservicetest Components
- Page Components
- Dashboardclient Components
- Ldapsettingscontroller Components
- Jwttokenprovider Components
- Insurancecontrollertest Components
- 403 Components
- Categorycontrollertest Components
- Authcontrollertest Components
- Signaturecontrollertest Components
- Dashboardcontroller Components
- Advancecontrollertest Components
- Jwtauthenticationfilter Components
- Asyncocrservice Components
- Asyncconfig Components
- Xpensesapplication Components
- Healthcontroller Components
- Document Components
- Bulkuploadzone Components
- Config Components
- Devdependencies Components
- Gradlew Components
- Userresponse Components
- Community 61
- Agent Components
- Document Components
- Document Components
- Expensestatusoverview Components
- Middleware Components
- Steps Components
- Pagedresponse Components
- Document Components
- Storage Components
- Config Components
- Community 79
- Config Components
- Spec Components
- Community 82
- Hook Components
- Guidelines Components
- Config Components
- Plan Components
- Plan Components
- Png Components
- Phase 4: Authentication & Role-Based Access Control
- GPT Review Notes — xpenses-kotlin
- Advance Payments Redesign — Design Spec
- xpenses-kotlin
- Repositories.kt
- List
- xpenses-kotlin Code Review
- Models.kt
- Mobile Responsive
- Requirements
- AuthProvider.tsx
- File Structure
- Requirements
- Int
- Dark Mode + Mobile Responsive — Implementation Plan
- Design Specification: Configurable Multi-Protocol Storage Location for Receipts & Reports
- Requirements
- .bulkUploadExpenses
- String
- queryKeys.ts
- Complete Codebase Review: xpenses-kotlin
- Requirements
- Requirements
- Testing Strategy Implementation Plan
- Decisions
- Frontend (Next.js / React)
- ExpenseController.kt
- Design Spec: Small Business Expense Manager (Zoho Clone)
- OpenSpec: Backend Optimizations & Code Quality Review
- Requirement: Blob downloads work on iOS and PWA
- Requirement: Signature drawing does not scroll the page
- Handoff: Codebase Review & Optimization Audit
- InventoryRequestRepository
- xpenses-kotlin: Agent Routing & Protocol
- DashboardControllerTest
- Trigger Notifications in Reports Implementation Plan
- Implementation Plan: Tax & VAT Tracking
- Email Configuration Implementation Plan
- Specification: Tax & VAT Tracking
- Role-Based Access Control
- Advance Payments Workflow
- Tax & VAT Tracking

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 47 edges
2. `ExpenseReport` - 37 edges
3. `AppShell()` - 30 edges
4. `api` - 30 edges
5. `IntegrationTestBase` - 25 edges
6. `ReportStateMachineTest` - 25 edges
7. `useToast()` - 25 edges
8. `setupAuthMocks()` - 25 edges
9. `Authentication & Role-Based Access Control — Implementation Plan` - 24 edges
10. `AppSettingsController` - 22 edges

## Surprising Connections (you probably didn't know these)
- `SettingsPage()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/app/admin/settings/page.tsx → frontend/components/AuthProvider.tsx
- `AdminUsersPage()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/app/admin/users/page.tsx → frontend/components/AuthProvider.tsx
- `LoginPage()` --calls--> `useAuth()`  [EXTRACTED]
  frontend/app/login/page.tsx → frontend/components/AuthProvider.tsx
- `AppShell()` --indirect_call--> `User`  [INFERRED]
  frontend/components/layout/AppShell.tsx → frontend/lib/api.ts
- `OcrJobRepository` --references--> `OcrJob`  [EXTRACTED]
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt

## Import Cycles
- None detected.

## Communities (136 total, 31 thin omitted)

### Community 0 - "Findallbyuserid Components"
Cohesion: 0.16
Nodes (6): ExpenseReport, ExpenseReportRepository, User, ReportServiceTest, Optional, Page

### Community 1 - "Httpservletrequest Components"
Cohesion: 0.05
Nodes (55): AdvanceController, AdvancePayBody, AdvancePaymentCreate, AdvancePaymentOut, AdvancePaymentUpdate, AdvanceRejectBody, AdvancePayment, HttpServletRequest (+47 more)

### Community 2 - "Bulkexpensecontroller Components"
Cohesion: 0.21
Nodes (5): ExpenseCreate, ExpenseUpdate, Expense, ExpenseServiceTest, User

### Community 3 - "Appsettingscontroller Components"
Cohesion: 0.05
Nodes (33): AppSettingsController, DailyAllowanceOut, DailyAllowanceUpdate, EmailConfigIn, EmailConfigOut, EmailSimulationIn, ImapConfigIn, ImapConfigOut (+25 more)

### Community 4 - "Spec Components"
Cohesion: 0.08
Nodes (21): ADMIN_PAGES, OTHER_PAGES, VIEWPORTS, CATEGORIES, DAILY_ALLOWANCE_RATE, DASHBOARD_DATA, EMAIL_SETTINGS, EXPENSES (+13 more)

### Community 5 - "Page Components"
Cohesion: 0.06
Nodes (41): DEFAULT_FORM, FormState, ImapAdminPage(), imapConfigSchema, DEFAULT_FORM, FormState, StorageAdminPage(), InventoryPage() (+33 more)

### Community 6 - "Any Components"
Cohesion: 0.08
Nodes (22): LocalStorageConfig, NetworkStorageConfig, S3StorageConfig, StorageConfigDto, Any, ByteArray, Map, String (+14 more)

### Community 7 - "Page Components"
Cohesion: 0.14
Nodes (18): ReceiptsCleanupPage(), formatAmount(), GlobalAdvancesPage(), formatEur(), PaymentsPage(), formatEur(), UserProfileDetailPage(), ProfilePage() (+10 more)

### Community 8 - "Page Components"
Cohesion: 0.09
Nodes (30): CategoriesPage(), formatLimit(), FormState, ExpensesPageContent(), formatAmount(), ExpensesPage(), formatEur(), NewReportPage() (+22 more)

### Community 9 - "React Components"
Cohesion: 0.06
Nodes (34): dependencies, axios, clsx, form-data, @hookform/resolvers, js-yaml, lucide-react, next (+26 more)

### Community 10 - "Inventorycontroller Components"
Cohesion: 0.13
Nodes (21): InventoryController, InventoryItemCreate, InventoryItemOut, InventoryItemUpdate, InventoryRejectBody, InventoryRequestCreate, InventoryRequestOut, Any (+13 more)

### Community 11 - "Page Components"
Cohesion: 0.29
Nodes (8): formatAmount(), formatDateTime(), formatDuration(), MileagePage(), Badge(), ROLE_STYLES, STATUS_STYLES, mileageKeys

### Community 12 - "Cacheconfig Components"
Cohesion: 0.12
Nodes (17): CacheConfig, AdvancePayment, BigDecimal, ByteArray, Double, Expense, List, MileageRecord (+9 more)

### Community 13 - "Page Components"
Cohesion: 0.13
Nodes (19): ApprovalsPage(), formatEur(), InsurancePage(), formatAmount(), ReportDetailPage(), formatEur(), ReportsPageContent(), SortDir (+11 more)

### Community 14 - "Datainitializer Components"
Cohesion: 0.28
Nodes (8): ActiveUpdateRequest, HttpServletRequest, Int, ResponseEntity, RoleUpdateRequest, UserController, UserCreateRequest, UserUpdateMeRequest

### Community 15 - "Sidebar Components"
Cohesion: 0.10
Nodes (20): metadata, viewport, NAV, NavItem, ROLE_LABELS, Sidebar(), SidebarProps, THEME_CYCLE (+12 more)

### Community 16 - "400 Components"
Cohesion: 0.16
Nodes (4): EntityManager, Expense, String, ReportStateMachineTest

### Community 17 - "Ldapservice Components"
Cohesion: 0.19
Nodes (13): Any, Boolean, Exception, Int, List, Map, String, LDAPBindException (+5 more)

### Community 18 - "Validationexceptionhandler Components"
Cohesion: 0.21
Nodes (11): Exception, Map, ResponseEntity, String, ValidationExceptionHandler, ConstraintViolationException, HttpMessageNotReadableException, MethodArgumentNotValidException (+3 more)

### Community 19 - "Mileagecontroller Components"
Cohesion: 0.22
Nodes (12): BigDecimal, HttpServletRequest, Int, List, MileageRecord, ResponseEntity, User, MileageController (+4 more)

### Community 20 - "Paths Components"
Cohesion: 0.10
Nodes (19): compilerOptions, allowJs, esModuleInterop, incremental, isolatedModules, jsx, lib, module (+11 more)

### Community 21 - "Insurancecontroller Components"
Cohesion: 0.20
Nodes (12): InsuranceController, InsuranceFileOut, Boolean, ByteArray, HttpServletRequest, HttpServletResponse, InsuranceFile, Int (+4 more)

### Community 22 - "Ocrservice Components"
Cohesion: 0.27
Nodes (9): Any, ByteArray, eu, Int, List, Map, String, OCRConfig (+1 more)

### Community 23 - "Ocrcontroller Components"
Cohesion: 0.15
Nodes (10): Boolean, HttpServletRequest, Int, MultipartFile, ResponseEntity, OcrComparisonRow, OcrController, OcrJob (+2 more)

### Community 24 - "Emailimportservice Components"
Cohesion: 0.26
Nodes (7): EmailImportService, Any, Boolean, Map, String, Message, Multipart

### Community 25 - "Reportservice Components"
Cohesion: 0.23
Nodes (6): BigDecimal, Int, List, String, User, ReportService

### Community 26 - "Authcontroller Components"
Cohesion: 0.30
Nodes (7): AuthController, ChangePasswordRequest, HttpServletRequest, HttpServletResponse, ResponseEntity, String, LoginRequest

### Community 27 - "200 Components"
Cohesion: 0.18
Nodes (4): InventoryRequest, InventoryControllerTest, EntityManager, InventoryItem

### Community 28 - "Fxservice Components"
Cohesion: 0.20
Nodes (6): FxRate, FxRateRepository, FxService, BigDecimal, String, FxServiceTest

### Community 29 - "Contextloadstest Components"
Cohesion: 0.14
Nodes (9): ContextLoadsTest, IntegrationTestBase, overrideProperties(), String, TestAuthHelper, Cookie, DynamicPropertyRegistry, MockMvc (+1 more)

### Community 30 - "Categorycontroller Components"
Cohesion: 0.22
Nodes (9): CategoryController, CategoryCreateRequest, CategoryUpdateRequest, Boolean, Category, Int, List, ResponseEntity (+1 more)

### Community 31 - "Cryptoservice Components"
Cohesion: 0.35
Nodes (4): CryptoService, ByteArray, Int, String

### Community 32 - "Securityconfig Components"
Cohesion: 0.18
Nodes (7): OncePerRequestFilter, String, SecurityConfig, BCryptPasswordEncoder, CorsConfigurationSource, HttpSecurity, SecurityFilterChain

### Community 33 - "400 Components"
Cohesion: 0.22
Nodes (3): ExpenseControllerTest, EntityManager, Expense

### Community 34 - "Page Components"
Cohesion: 0.18
Nodes (12): DEFAULT_FORM, entriesToRoleMap(), FormState, LdapAdminPage(), ldapConfigSchema, ROLE_OPTIONS, RoleMapEntry, roleMapToEntries() (+4 more)

### Community 35 - "Color Components"
Cohesion: 0.15
Nodes (12): background_color, description, display, display_override, icons, id, name, orientation (+4 more)

### Community 36 - "Exportservice Components"
Cohesion: 0.36
Nodes (6): ExportService, Any, ByteArray, List, Map, String

### Community 38 - "Ocrservicetest Components"
Cohesion: 0.38
Nodes (3): OcrComparison, BigDecimal, OcrComparisonRepository

### Community 39 - "Page Components"
Cohesion: 0.23
Nodes (11): DEFAULT_FORM, FormState, getStatusColor(), OcrAdminPage(), ocrConfigSchema, getOcrComparisons(), getOcrConfig(), OcrConfig (+3 more)

### Community 40 - "Dashboardclient Components"
Cohesion: 0.18
Nodes (9): DashboardClient(), formatEur(), getCategoryMeta(), ExpenseStatusOverviewProps, DataPoint, SpendChart(), SpendChartProps, DashboardStats (+1 more)

### Community 41 - "Ldapsettingscontroller Components"
Cohesion: 0.38
Nodes (5): ResponseEntity, LdapConfigIn, LdapConfigOut, LdapSettingsController, LdapConfig

### Community 42 - "Jwttokenprovider Components"
Cohesion: 0.25
Nodes (5): ClaimsData, JwtTokenProvider, Int, String, SecretKey

### Community 43 - "Insurancecontrollertest Components"
Cohesion: 0.24
Nodes (3): InsuranceControllerTest, EntityManager, InsuranceFile

### Community 48 - "Dashboardcontroller Components"
Cohesion: 0.32
Nodes (6): CategorySpend, DashboardController, DashboardStats, Boolean, HttpServletRequest, DashboardStats

### Community 50 - "Jwtauthenticationfilter Components"
Cohesion: 0.29
Nodes (5): JwtAuthenticationFilter, HttpServletRequest, HttpServletResponse, OncePerRequestFilter, FilterChain

### Community 51 - "Asyncocrservice Components"
Cohesion: 0.43
Nodes (4): AsyncOcrService, ByteArray, Int, String

### Community 52 - "Asyncconfig Components"
Cohesion: 0.40
Nodes (3): AsyncConfig, Executor, ThreadPoolTaskExecutor

### Community 53 - "Xpensesapplication Components"
Cohesion: 0.40
Nodes (4): Array, String, main(), XpensesApplication

### Community 54 - "Healthcontroller Components"
Cohesion: 0.40
Nodes (3): HealthController, Map, String

### Community 56 - "Bulkuploadzone Components"
Cohesion: 0.50
Nodes (4): ALLOWED_TYPES, BulkUploadZone(), BulkUploadZoneProps, filterFiles()

### Community 57 - "Config Components"
Cohesion: 0.40
Nodes (4): compat, __dirname, eslintConfig, __filename

### Community 58 - "Devdependencies Components"
Cohesion: 0.40
Nodes (4): devDependencies, @fission-ai/openspec, name, private

### Community 59 - "Gradlew Components"
Cohesion: 0.83
Nodes (3): gradlew script, die(), warn()

### Community 60 - "Userresponse Components"
Cohesion: 0.67
Nodes (3): fromUser(), User, UserResponse

### Community 67 - "Expensestatusoverview Components"
Cohesion: 0.07
Nodes (29): 1. Goals, 2. Non-Goals, 3. Infrastructure & Test Base, 4. State Machine Tests, 5. API Contract Tests, 6. Service Unit Tests, 7. What Is Not Tested, 8. CI Integration (+21 more)

### Community 84 - "Guidelines Components"
Cohesion: 0.07
Nodes (28): Authentication & Role-Based Access Control — Implementation Plan, Backend — Modified Files, Backend — New Files, File Structure, Frontend — Modified Files, Frontend — New Files, Summary of Commits, Task 10: Protect Existing Routers with Auth (+20 more)

### Community 92 - "Phase 4: Authentication & Role-Based Access Control"
Cohesion: 0.07
Nodes (28): API Endpoints, Auth Router (`/api/auth`), Auth Strategy, Authentication Flow, Backend (new packages), Backend Route Protection, Changes to Existing Endpoints, Database Schema (+20 more)

### Community 93 - "GPT Review Notes — xpenses-kotlin"
Cohesion: 0.07
Nodes (26): 10. Static/Fake Dashboard Metrics, 11. Next.js Tooling Warnings, 12. Build-Time Dynamic Route Warnings, 13. Large Files / Maintainability, 1. Storage Admin Contract Is Broken, 2. Dashboard Export Endpoint Is Wrong, 3. Flyway Validation Is Disabled, 4. Soft-Delete Cascade Policy Is Unfinished (+18 more)

### Community 94 - "Advance Payments Redesign — Design Spec"
Cohesion: 0.08
Nodes (24): 1. Database Schema, 2.1 Modified endpoints (`/api/reports/{report_id}/advances`), 2.2 New action endpoints, 2.3 Global endpoint (new router or added to existing), 2.4 Permission matrix, 2.5 Calculation changes, 2. Backend API, 3.1 Dedicated Advances Page (`/reports/[id]/advances`) (+16 more)

### Community 95 - "xpenses-kotlin"
Cohesion: 0.08
Nodes (23): API Endpoints, Backend Architecture, Backend Hot-Swapping (Local Development), Development (local, hot-reload), Docker Compose Services, Environment Variables, Features, Frontend Architecture (+15 more)

### Community 96 - "Repositories.kt"
Cohesion: 0.16
Nodes (10): RefreshToken, CategoryRepository, InsuranceFileRepository, Category, InsuranceFile, Receipt, OcrJobRepository, ReceiptRepository (+2 more)

### Community 97 - "List"
Cohesion: 0.28
Nodes (4): ExpenseRepository, Expense, List, Pageable

### Community 98 - "xpenses-kotlin Code Review"
Cohesion: 0.11
Nodes (18): 🏗️ Architecture Overview, Backend, Backend, Backend ✅, 🔴 Critical / High Severity Issues, Frontend, Frontend, Frontend ✅ (+10 more)

### Community 99 - "Models.kt"
Cohesion: 0.15
Nodes (12): DataInitializer, String, AdvancePayment, Category, InsuranceFile, InventoryItem, InventoryRequest, MileageRecord (+4 more)

### Community 100 - "Mobile Responsive"
Cohesion: 0.11
Nodes (17): AppShell Changes, Color Mapping, Dark Mode, Dependencies, Files to Modify, Files to Modify, Mobile Responsive, Other Responsive Fixes (+9 more)

### Community 101 - "Requirements"
Cohesion: 0.11
Nodes (17): mobile-ux-polish Specification, Purpose, Requirement: Charts show honest empty states, Requirement: Destructive delete requires confirmation, Requirement: Dropdown dismiss layer above page chrome, Requirement: No dead UI in the mobile header, Requirement: No unauthenticated UI flash, Requirement: Toasts fully visible on small screens (+9 more)

### Community 102 - "AuthProvider.tsx"
Cohesion: 0.18
Nodes (12): AdminUsersPage(), CreateUserForm, ROLE_OPTIONS, userKeys, LoginPage(), AuthContext, AuthContextType, AuthProvider() (+4 more)

### Community 103 - "File Structure"
Cohesion: 0.12
Nodes (15): Advance Payments Redesign — Implementation Plan, File Structure, Files to create, Files to modify, Task 10: Update report detail page and sidebar, Task 11: Rebuild, test, and verify, Task 1: Database schema migration, Task 2: Backend models (+7 more)

### Community 104 - "Requirements"
Cohesion: 0.12
Nodes (15): mobile-safe-area Specification, Purpose, Requirement: Fixed mobile chrome respects safe areas, Requirement: Overlays lock body scroll, Requirement: Safe-area CSS utilities exist, Requirement: Viewport enables edge-to-edge rendering, Requirement: Viewport height uses dynamic units, Requirements (+7 more)

### Community 105 - "Int"
Cohesion: 0.27
Nodes (7): AdvancePaymentRepository, InventoryItemRepository, AdvancePayment, Int, InventoryItem, MileageRecord, MileageRecordRepository

### Community 106 - "Dark Mode + Mobile Responsive — Implementation Plan"
Cohesion: 0.14
Nodes (13): Dark Mode + Mobile Responsive — Implementation Plan, File Structure, Modified Files, New Files, Task 1: CSS and Theme Infrastructure, Task 2: Responsive AppShell + Sidebar with Theme Toggle, Task 3: Dark Mode for Shared UI Components, Task 4: Dark Mode + Mobile for Login Page (+5 more)

### Community 107 - "Design Specification: Configurable Multi-Protocol Storage Location for Receipts & Reports"
Cohesion: 0.14
Nodes (13): 1. Executive Summary & Objectives, 2.1 The Local Cache Solution (Approach 1), 2. Architecture & Data Flow, 3. Configuration Schema, 4.1 Base Storage Provider Interface, 4.2 Libraries & Implementation Details, 4.3 Storage Manager & Local Cache Coordinator, 4. Backend Implementation Specs (+5 more)

### Community 108 - "Requirements"
Cohesion: 0.14
Nodes (13): mobile-forms Specification, Purpose, Requirement: Amount fields use decimal input mode, Requirement: Form controls prevent iOS focus zoom, Requirement: Login form supports iOS autofill, Requirement: Native controls match color scheme, Requirements, Scenario: Date picker matches dark mode (+5 more)

### Community 109 - ".bulkUploadExpenses"
Cohesion: 0.21
Nodes (9): BulkExpenseController, ByteArray, HttpServletRequest, Int, List, MultipartFile, ResponseEntity, String (+1 more)

### Community 110 - "String"
Cohesion: 0.28
Nodes (5): Boolean, String, User, UserRepository, Long

### Community 111 - "queryKeys.ts"
Cohesion: 0.18
Nodes (10): DEFAULT_FORM, EmailAdminPage(), FormState, smtpConfigSchema, SettingsPage(), MileageRates, SmtpConfig, SmtpTestResult (+2 more)

### Community 112 - "Complete Codebase Review: xpenses-kotlin"
Cohesion: 0.15
Nodes (12): Architecture Assessment, Backend (Kotlin/Spring Boot), Complete Codebase Review: xpenses-kotlin, Critical / High, Frontend (Next.js 15), Issues Found, Low / Code Quality, Medium (+4 more)

### Community 113 - "Requirements"
Cohesion: 0.15
Nodes (12): Purpose, pwa-runtime Specification, Requirement: Cache version rolls forward, Requirement: Manifest colors are consistent, Requirement: Service worker never caches API traffic, Requirement: Update flow activates new worker predictably, Requirements, Scenario: Existing installs update (+4 more)

### Community 114 - "Requirements"
Cohesion: 0.15
Nodes (12): Purpose, receipt-capture-preview Specification, Requirement: Direct camera capture for receipts, Requirement: Receipt list keys are unique and stable, Requirement: Upload copy matches device capabilities, Requirement: Zoomed receipt preview pans with touch, Requirements, Scenario: Browse option preserved (+4 more)

### Community 115 - "Testing Strategy Implementation Plan"
Cohesion: 0.17
Nodes (11): Done, File Map, Task 1: Gradle Dependencies + Test Infrastructure, Task 2: State Machine Tests — Submit & Recall, Task 3: State Machine Tests — Approve, Reject, Pay, Task 4: Auth & User Contract Tests, Task 5: Expense, Dashboard & Advance Contract Tests, Task 6: FxService Unit Tests (+3 more)

### Community 116 - "Decisions"
Cohesion: 0.17
Nodes (11): 1. Data Model & Configuration Settings, 2. Backend Strategy Pattern (Factory & Providers), 3. API Settings Endpoints, 4. Frontend Admin UI, Context, Decisions, Goals, Goals / Non-Goals (+3 more)

### Community 117 - "Frontend (Next.js / React)"
Cohesion: 0.18
Nodes (10): Backend (Kotlin / Spring Boot), Code Review — xpenses-kotlin, Critical, Critical / High, Frontend (Next.js / React), High, Low, Medium (+2 more)

### Community 118 - "ExpenseController.kt"
Cohesion: 0.22
Nodes (6): BulkUploadError, BulkUploadResult, ReceiptOut, ExpenseMapper, Expense, Receipt

### Community 119 - "Design Spec: Small Business Expense Manager (Zoho Clone)"
Cohesion: 0.20
Nodes (9): 1. Overview, 2. Technical Stack, 3.1 Smart Receipt Capture (OCR), 3.2 Multi-Currency Engine, 3.3 Reimbursement Workflow, 3. Core Features, 4. Architecture, 5. Success Criteria (+1 more)

### Community 120 - "OpenSpec: Backend Optimizations & Code Quality Review"
Cohesion: 0.20
Nodes (9): 1. Update Project Rules, 2. Repository Layer Refactoring (Database Filtering), 3. Type Safety in StorageService, 4. Architecture and Smells Audit, Context, Goals, OpenSpec: Backend Optimizations & Code Quality Review, Proposed Changes (+1 more)

### Community 121 - "Requirement: Blob downloads work on iOS and PWA"
Cohesion: 0.20
Nodes (9): file-downloads Specification, Purpose, Requirement: Blob downloads work on iOS and PWA, Requirement: Download entry points use the shared helper, Requirements, Scenario: Desktop downloads unchanged, Scenario: Export expenses CSV on iOS, Scenario: No premature revocation (+1 more)

### Community 122 - "Requirement: Signature drawing does not scroll the page"
Cohesion: 0.22
Nodes (8): Purpose, Requirement: Drawing surfaces use pointer-compatible gestures, Requirement: Signature drawing does not scroll the page, Requirements, Scenario: Mouse signing still works, Scenario: Signing on iPhone, Scenario: Touch pan on zoomed receipt, signature-capture Specification

### Community 123 - "Handoff: Codebase Review & Optimization Audit"
Cohesion: 0.25
Nodes (7): 1. Security & Configuration Fixes, 2. JPA Query Optimizations (N+1 Elimination), Changes Summary, Handoff: Codebase Review & Optimization Audit, Next Steps / Recommendations, Overview, Verification

### Community 125 - "xpenses-kotlin: Agent Routing & Protocol"
Cohesion: 0.33
Nodes (5): CI pipeline (must pass CI-checks locally), Routing & Personas (Layer 2), Test accounts (when `SEED_DEMO_USERS=true`), Workflow (OpenSpec), xpenses-kotlin: Agent Routing & Protocol

### Community 127 - "Trigger Notifications in Reports Implementation Plan"
Cohesion: 0.33
Nodes (5): Task 1: Create failing tests for Report Submitted notification, Task 2: Implement Submission Notification, Task 3: Create failing tests for Approved, Rejected, Paid notifications, Task 4: Implement Approved, Rejected, Paid Notifications, Trigger Notifications in Reports Implementation Plan

### Community 128 - "Implementation Plan: Tax & VAT Tracking"
Cohesion: 0.33
Nodes (5): Implementation Plan: Tax & VAT Tracking, Step 1: Database Migration, Step 2: Backend Models & Routers, Step 3: OCR Enhancements, Step 4: Frontend UI

### Community 129 - "Email Configuration Implementation Plan"
Cohesion: 0.40
Nodes (4): Email Configuration Implementation Plan, Task 1: Update Dependencies, Task 2: Update Configuration, Task 3: Verify Installation

### Community 130 - "Specification: Tax & VAT Tracking"
Cohesion: 0.50
Nodes (3): Overview, Requirements, Specification: Tax & VAT Tracking

## Knowledge Gaps
- **471 isolated node(s):** `XpensesApplication`, `EmailSimulationIn`, `BulkUploadResult`, `InventoryItemCreate`, `InventoryItemUpdate` (+466 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **31 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ExpenseReport` connect `Findallbyuserid Components` to `Httpservletrequest Components`, `Models.kt`, `Mileagecontrollertest Components`, `Cacheconfig Components`, `400 Components`, `Advancecontrollertest Components`, `Mileagecontroller Components`, `Emailimportservice Components`, `Reportservice Components`?**
  _High betweenness centrality (0.102) - this node is a cross-community bridge._
- **Why does `IntegrationTestBase` connect `Contextloadstest Components` to `Findallbyuserid Components`, `Appsettingscontroller Components`, `400 Components`, `Ocrservice Components`, `200 Components`, `Fxservice Components`, `400 Components`, `Mileagecontrollertest Components`, `Insurancecontrollertest Components`, `403 Components`, `Categorycontrollertest Components`, `Authcontrollertest Components`, `Signaturecontrollertest Components`, `Advancecontrollertest Components`, `Repositories.kt`, `List`, `Int`, `String`, `DashboardControllerTest`?**
  _High betweenness centrality (0.058) - this node is a cross-community bridge._
- **Why does `ExpenseReportRepository` connect `Findallbyuserid Components` to `Repositories.kt`, `Int`, `Contextloadstest Components`, `String`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Are the 77 inferred relationships involving `ResponseStatusException` (e.g. with `.createAdvance()` and `.deleteAdvance()`) actually correct?**
  _`ResponseStatusException` has 77 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `ExpenseReport` (e.g. with `.run()` and `.processIncomingEmail()`) actually correct?**
  _`ExpenseReport` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `XpensesApplication`, `EmailSimulationIn`, `BulkUploadResult` to the rest of the system?**
  _473 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Httpservletrequest Components` be split into smaller, more focused modules?**
  _Cohesion score 0.05241605241605242 - nodes in this community are weakly interconnected._