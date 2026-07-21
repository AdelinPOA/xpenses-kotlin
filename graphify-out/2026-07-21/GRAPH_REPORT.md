# Graph Report - .  (2026-07-21)

## Corpus Check
- 234 files · ~151,277 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1358 nodes · 2778 edges · 92 communities (62 shown, 30 thin omitted)
- Extraction: 95% EXTRACTED · 5% INFERRED · 0% AMBIGUOUS · INFERRED: 152 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

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

## God Nodes (most connected - your core abstractions)
1. `useAuth()` - 47 edges
2. `ExpenseReport` - 36 edges
3. `AppShell()` - 30 edges
4. `api` - 30 edges
5. `IntegrationTestBase` - 25 edges
6. `useToast()` - 25 edges
7. `setupAuthMocks()` - 25 edges
8. `ReportStateMachineTest` - 23 edges
9. `AppSettingsController` - 22 edges
10. `ReportController` - 22 edges

## Surprising Connections (you probably didn't know these)
- `AppSettingRepository` --references--> `AppSetting`  [EXTRACTED]
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt
- `OcrJobRepository` --references--> `OcrJob`  [EXTRACTED]
  backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/models/Models.kt
- `IntegrationTestBase` --references--> `UserRepository`  [EXTRACTED]
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt
- `IntegrationTestBase` --references--> `CategoryRepository`  [EXTRACTED]
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt
- `IntegrationTestBase` --references--> `ExpenseReportRepository`  [EXTRACTED]
  backend-kotlin-jpa/src/test/kotlin/eu/nt/xpenses/IntegrationTestBase.kt → backend-kotlin-jpa/src/main/kotlin/eu/nt/xpenses/repositories/Repositories.kt

## Import Cycles
- None detected.

## Communities (92 total, 30 thin omitted)

### Community 0 - "Findallbyuserid Components"
Cohesion: 0.05
Nodes (43): ExpenseReport, FxRate, InsuranceFile, InventoryItem, InventoryRequest, MileageRecord, OcrComparison, RefreshToken (+35 more)

### Community 1 - "Httpservletrequest Components"
Cohesion: 0.07
Nodes (42): AdvanceController, AdvancePayBody, AdvancePaymentCreate, AdvancePaymentOut, AdvancePaymentUpdate, AdvanceRejectBody, AdvancePayment, HttpServletRequest (+34 more)

### Community 2 - "Bulkexpensecontroller Components"
Cohesion: 0.05
Nodes (36): BulkExpenseController, ByteArray, HttpServletRequest, Int, List, MultipartFile, ResponseEntity, String (+28 more)

### Community 3 - "Appsettingscontroller Components"
Cohesion: 0.07
Nodes (28): AppSettingsController, DailyAllowanceOut, DailyAllowanceUpdate, EmailConfigIn, EmailConfigOut, EmailSimulationIn, ImapConfigIn, ImapConfigOut (+20 more)

### Community 4 - "Spec Components"
Cohesion: 0.08
Nodes (21): ADMIN_PAGES, OTHER_PAGES, VIEWPORTS, CATEGORIES, DAILY_ALLOWANCE_RATE, DASHBOARD_DATA, EMAIL_SETTINGS, EXPENSES (+13 more)

### Community 5 - "Page Components"
Cohesion: 0.07
Nodes (39): DEFAULT_FORM, FormState, ImapAdminPage(), imapConfigSchema, DEFAULT_FORM, FormState, StorageAdminPage(), requestStatusColors (+31 more)

### Community 6 - "Any Components"
Cohesion: 0.10
Nodes (20): AppSetting, Any, ByteArray, Map, String, S3StorageProvider, Any, ByteArray (+12 more)

### Community 7 - "Page Components"
Cohesion: 0.10
Nodes (26): ReceiptsCleanupPage(), SettingsPage(), AdminUsersPage(), CreateUserForm, ROLE_OPTIONS, userKeys, formatAmount(), GlobalAdvancesPage() (+18 more)

### Community 8 - "Page Components"
Cohesion: 0.10
Nodes (29): CategoriesPage(), formatLimit(), FormState, ExpensesPageContent(), formatAmount(), ExpensesPage(), BulkExpenseRowProps, BulkReviewDrawer() (+21 more)

### Community 9 - "React Components"
Cohesion: 0.06
Nodes (34): dependencies, axios, clsx, form-data, @hookform/resolvers, js-yaml, lucide-react, next (+26 more)

### Community 10 - "Inventorycontroller Components"
Cohesion: 0.13
Nodes (21): InventoryController, InventoryItemCreate, InventoryItemOut, InventoryItemUpdate, InventoryRejectBody, InventoryRequestCreate, InventoryRequestOut, Any (+13 more)

### Community 11 - "Page Components"
Cohesion: 0.11
Nodes (22): formatEur(), UserProfileDetailPage(), AdvancesPage(), formatAmount(), formatAmount(), formatDateTime(), formatDuration(), MileagePage() (+14 more)

### Community 12 - "Cacheconfig Components"
Cohesion: 0.12
Nodes (17): CacheConfig, AdvancePayment, BigDecimal, ByteArray, Double, Expense, List, MileageRecord (+9 more)

### Community 13 - "Page Components"
Cohesion: 0.11
Nodes (22): DEFAULT_FORM, EmailAdminPage(), FormState, smtpConfigSchema, ApprovalsPage(), formatEur(), InsurancePage(), InventoryPage() (+14 more)

### Community 14 - "Datainitializer Components"
Cohesion: 0.13
Nodes (15): DataInitializer, String, ActiveUpdateRequest, HttpServletRequest, Int, ResponseEntity, RoleUpdateRequest, UserController (+7 more)

### Community 15 - "Sidebar Components"
Cohesion: 0.10
Nodes (20): metadata, viewport, NAV, NavItem, ROLE_LABELS, Sidebar(), SidebarProps, THEME_CYCLE (+12 more)

### Community 16 - "400 Components"
Cohesion: 0.17
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
Cohesion: 0.23
Nodes (4): FxService, BigDecimal, String, FxServiceTest

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
Cohesion: 0.23
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
Cohesion: 0.20
Nodes (5): Any, Double, Map, String, OcrServiceTest

### Community 39 - "Page Components"
Cohesion: 0.23
Nodes (11): DEFAULT_FORM, FormState, getStatusColor(), OcrAdminPage(), ocrConfigSchema, getOcrComparisons(), getOcrConfig(), OcrConfig (+3 more)

### Community 40 - "Dashboardclient Components"
Cohesion: 0.24
Nodes (8): DashboardClient(), formatEur(), getCategoryMeta(), DataPoint, SpendChart(), SpendChartProps, DashboardStats, dashboardKeys

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

## Knowledge Gaps
- **165 isolated node(s):** `XpensesApplication`, `EmailSimulationIn`, `BulkUploadResult`, `InventoryItemCreate`, `InventoryItemUpdate` (+160 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **30 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `ExpenseReport` connect `Findallbyuserid Components` to `Httpservletrequest Components`, `Mileagecontrollertest Components`, `Cacheconfig Components`, `Datainitializer Components`, `400 Components`, `Advancecontrollertest Components`, `Mileagecontroller Components`, `Emailimportservice Components`, `Reportservice Components`?**
  _High betweenness centrality (0.180) - this node is a cross-community bridge._
- **Why does `IntegrationTestBase` connect `Contextloadstest Components` to `Findallbyuserid Components`, `400 Components`, `Bulkexpensecontroller Components`, `Appsettingscontroller Components`, `Mileagecontrollertest Components`, `Insurancecontrollertest Components`, `403 Components`, `Categorycontrollertest Components`, `Authcontrollertest Components`, `Signaturecontrollertest Components`, `400 Components`, `Advancecontrollertest Components`, `Ocrservice Components`, `200 Components`, `Fxservice Components`?**
  _High betweenness centrality (0.103) - this node is a cross-community bridge._
- **Why does `AppSetting` connect `Any Components` to `Findallbyuserid Components`, `Appsettingscontroller Components`, `Ocrservicetest Components`, `Datainitializer Components`, `Ldapservice Components`, `Ocrservice Components`?**
  _High betweenness centrality (0.063) - this node is a cross-community bridge._
- **Are the 77 inferred relationships involving `ResponseStatusException` (e.g. with `.createAdvance()` and `.deleteAdvance()`) actually correct?**
  _`ResponseStatusException` has 77 INFERRED edges - model-reasoned connections that need verification._
- **Are the 9 inferred relationships involving `ExpenseReport` (e.g. with `.run()` and `.processIncomingEmail()`) actually correct?**
  _`ExpenseReport` has 9 INFERRED edges - model-reasoned connections that need verification._
- **What connects `XpensesApplication`, `EmailSimulationIn`, `BulkUploadResult` to the rest of the system?**
  _167 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Findallbyuserid Components` be split into smaller, more focused modules?**
  _Cohesion score 0.0533028745478774 - nodes in this community are weakly interconnected._