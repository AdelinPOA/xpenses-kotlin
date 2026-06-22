# Full-Stack Improvement Audit

Generated 2026-06-22. Source: MCP-assisted analysis (PostgreSQL, Context7) + code review of all layers.

---

## 🔴 Critical

| Area | Issue | Location | Fix |
|------|-------|----------|-----|
| Security | Path traversal in file upload | `InsuranceController.kt:104` — `originalFilename` unsanitized | Strip directory separators, use `File(originalName).name` |
| Security | Gemini API key in URL query param | `EmailImportService.kt:274` — `?key=$apiKey` | Use `x-goog-api-key` header (like `OcrService.kt` does) |
| Security | Empty `JWT_SECRET` starts the app | `application.yml:31` — `JWT_SECRET:${JWT_SECRET:}` | Add `@PostConstruct` validation or Spring Boot startup check |
| Auth | 401 refresh queue leaks promises on failure | `lib/api.ts:39-44` — `processQueue` never called on refresh fail | Call `processQueue(refreshError, null)` before redirect |

## 🟠 High

### Backend

| Issue | Location | Fix |
|-------|----------|-----|
| 15 entities in one 671-line file | `Models.kt` | Split by domain: `User.kt`, `Expense.kt`, `Category.kt`, etc. |
| Fat controllers with business logic | `AdvanceController`, `MileageController`, `DashboardController`, `InventoryController`, `InsuranceController` | Extract `AdvanceService`, `MileageService`, `DashboardService`, `InventoryService`, `InsuranceService` |
| `calculateDailyAllowance()` duplicated | `ReportController.kt:481` and `PdfService.kt:635` | Extract to shared utility or `AppSettingService` |
| Dead code — 3 unused methods | `ReportService.kt:24-43` (`getReportWithExpenses`, `getAllReportsWithExpenses`, `processAllReportsEagerly`) | Remove or `@Deprecated` |
| Dead config for SFTP/SMB/WebDAV stubs | `StorageService.kt:38-56`, `AppSettingsController.kt:300-307` | ~40 lines of dead encryption/masking — remove unless planned |
| `System.err.println` instead of logger | `ReportController.kt:492` | Replace with `log.warn()` |
| OSIV anti-pattern enabled by default | `application.yml` — default `spring.jpa.open-in-view: true` | Add `spring.jpa.open-in-view: false` |
| No Kotlin linting in CI | `.github/workflows/ci.yml` | Add ktlint or detekt plugin + CI step |
| `javax.cache` instead of `jakarta.cache` | `build.gradle.kts:39` | Spring Boot 3 uses `jakarta.*` — migrate |
| 10+ hardcoded values | Sidecar URL, storage paths, FX API URLs, JWT expiry, file size limits | Inject via `@Value` |
| `!!` force-unwrap on nullable DB fields | Multiple controllers | Use `?: throw ResponseStatusException(...)` |

### Frontend

| Issue | Location | Fix |
|-------|----------|-----|
| `react-hooks/exhaustive-deps` disabled globally | `eslint.config.mjs:22` | Remove override; fix ~5 real dependency issues |
| 12 `any` + 4 `as any` | Error handlers (`catch (e: any)`) + `zodResolver as any` | Type as `unknown` + narrowing; fix zod resolver types |
| Plain `"Loading..."` text on 3 pages | `categories/page.tsx:82`, `expenses/[id]/edit/page.tsx:23-24`, `reports/[id]/edit/page.tsx:57-58` | Use skeletons |
| No error states on 5 admin pages | `admin/email`, `admin/imap`, `admin/ldap`, `admin/ocr`, `admin/storage` | Add `isError` handling |
| 706-line `ExpenseForm.tsx` | `components/expenses/ExpenseForm.tsx` | Split into 6 sub-components; migrate to `react-hook-form` |
| Dead file: `lib/themes.ts` | 31 lines, never imported, all roles map to `"blue"` | Delete |
| `formatEur`/`formatAmount` duplicated 11 times | Across dashboard, expenses, reports, approvals, payments, categories, profile | Extract `lib/format.ts` |
| `middleware.ts` missing non-PNG image extensions | `middleware.ts:6` — only `endsWith(".png")` | Add `.jpg`, `.svg`, `.webp`, `.ico`, `.css`, `.js` |
| Toast `setTimeout` never cleaned up | `ToastProvider.tsx:38` | Wrap in `useEffect` with cleanup |
| Auth guard inconsistent | 3 pages redirect, 3 pages show inline "Access Denied" | Unify on redirect pattern |
| `useEffect` for greeting time | `DashboardGreeting.tsx:12` — state + effect for a synchronous computation | Replace with plain function call |
| `expenseKeys`, `reportKeys` in `queryKeys.ts` — but `userKeys`, `insuranceKeys`, `profileKeys` inline | `admin/users/page.tsx:19-22`, inline strings elsewhere | Move all to `lib/queryKeys.ts` |

### Infrastructure

| Issue | Location | Fix |
|-------|----------|-----|
| No `.dockerignore` files | 4 Dockerfiles (`backend-kotlin-jpa`, `frontend`, `ocr-sidecar`, `mineru`) | Create per-context `.dockerignore` excluding `node_modules/`, `build/`, `.gradle/`, `.next/`, `venv/` |
| Hardcoded DB credentials in compose | `docker-compose.yml:7,39-40` | Use `${POSTGRES_PASSWORD}` env var references |
| No Docker layer caching in CI | `.github/workflows/ci.yml:90-92` | Use `docker/build-push-action` with `cache-from/to: type=gha` |
| Frontend missing `depends_on` + `restart` | `docker-compose.yml:64-89` | Add `depends_on: backend: condition: service_healthy`, `restart: unless-stopped` |
| No logging config (unbounded growth) | All services in `docker-compose.yml` | Add `logging: driver: json-file, options: { max-size: "10m", max-file: "3" }` |
| No `cap_drop` / `security_opt` hardening | All containers | Add `cap_drop: [ALL]`, `cap_add: [NET_BIND_SERVICE]`, `security_opt: [no-new-privileges:true]` |
| MinerU packages unpinned | `mineru/Dockerfile:38` — `pip install "mineru[all]"` no version | Pin to `mineru[all]==x.y.z` |
| No monitoring stack | Prometheus metrics exported but never scraped | Add `prometheus` + `grafana` services to compose |
| Backend healthcheck too tight (15s) | `docker-compose.yml:61` | Bump to 45s (override already does 60s) |
| MinerU healthcheck pings `/docs` | `docker-compose.yml:128` | Use `/health` instead of Swagger UI |
| Frontend healthcheck uses `wget` | `docker-compose.yml:82` | May not be in `node:22-alpine` — use `node -e` or install `curl` |
| No `libs.versions.toml` version catalog | `build.gradle.kts` | Centralize all dependency versions |
| No `make ps`, `make clean`, `make logs-all` | `Makefile` | Add common dev commands |
| No path filtering in CI | Full workflow runs on every push to `main` | Use `dorny/paths-filter` to skip backend jobs when only frontend changes |
| `build-kotlin` and `build-frontend` no timeout | CI jobs | Add `timeout-minutes: 20` / `timeout-minutes: 15` |

## 🟡 Medium

| Area | Issue | Location | Fix |
|------|-------|----------|-----|
| Backend | SignatureController path traversal | `SignatureController.kt:31-48` — no check that path is within expected dir | Validate `signaturePath` is under `signaturesDir` |
| Backend | Rate-limit `/api/auth/change-password` | `application.yml:56-80` — only login/refresh are limited | Add rate-limit filter for change-password |
| Backend | `@Transactional` inconsistency | `ExpenseController` uses `TransactionTemplate.execute{}` while other controllers use `@Transactional` | Document or unify pattern |
| Backend | Error response shape inconsistency | Some controllers return `mapOf("detail" to ...)`, others use `ResponseStatusException` | Create consistent error response DTO |
| Backend | No CSP headers | `SecurityConfig.kt:33` | Add Content Security Policy header |
| Frontend | `next.config.ts` rewrite fallback URL hardcoded | `next.config.ts:9` — `"http://localhost:8001/api"` | Already env-configured; low risk |
| Frontend | No server-side prefetch on reports page | `app/reports/page.tsx` — entirely client-rendered | Add `serverFetch` + `dehydrate` + `HydrationBoundary` |
| Frontend | Repeated inline component patterns | `inputCls`, delete modals, export drawers, role colors across 4+ files each | Extract shared `TextField`, `ConfirmDialog`, `ExportMenu` components |
| Frontend | `useParams()` vs `use()` inconsistency | `profile/[id]` uses legacy `useParams()`, `reports/[id]` uses `use()` | Migrate to `use()` pattern |
| Frontend | No `redirect_to` on login redirect | `middleware.ts:13` | Append `?redirect_to=${pathname}` |
| Infra | No `SPRING_PROFILES_ACTIVE` in `.env.example` | `.env.example` | Add `SPRING_PROFILES_ACTIVE=prod` |
| Infra | No `IMAP_POLL_INTERVAL` in `.env.example` | `.env.example` | Add documented env var |
| Infra | No `LOG_LEVEL` in `.env.example` | `.env.example` | Add `LOGGING_LEVEL_ROOT=INFO` |
| Infra | Backend K8s probes vs Docker healthcheck inconsistency | `deployment.yaml` uses `/actuator/health/*`, compose uses `/api/health` | Align on one pattern |
| Infra | `read_only: true` not set on any container | All services in `docker-compose.yml` | Add `read_only: true` + `tmpfs` mounts for temp dirs |

## 🟢 Low (nice-to-haves)

- Add `useDebounce` custom hook for search inputs
- Add Spring task executor pool config (`spring.task.execution.pool.*`)
- Add `@Value` for FX API URLs, JWT refresh expiry, default currency, receipt extensions
- Split `Repositories.kt` (225 lines, 11 repos) by domain
- Standardize inline DTO mappers (`mapAdvanceToOut`, `mapRecordToOut`, etc.) into dedicated mapper components
- Add `management.metrics.tags.application` for Prometheus
- Add Grafana dashboard + Prometheus scrape config
- Add `docker compose ps` / `docker compose down -v` / `docker system prune` commands to Makefile
- Add `spring.output.ansi.enabled` for colored console logs
- Remove unused imports (`BigDecimal`, `RoundingMode` from `ExpenseController.kt`, `ReportController.kt`)
