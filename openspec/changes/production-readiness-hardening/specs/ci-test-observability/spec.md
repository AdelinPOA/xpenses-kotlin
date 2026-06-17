## ADDED Requirements

### Requirement: CI runs the existing Kotlin test suite
The `ci.yml` workflow SHALL execute `./gradlew test` (in addition to `bootJar`) so that the 10 existing JUnit test files (Auth, User, Expense, Dashboard, Advance, ReportStateMachine, FxService) run on every push and pull request.

#### Scenario: tests run on push to main
- **WHEN** a commit is pushed to `main` (or a PR opened)
- **THEN** the CI workflow includes a step that runs `./gradlew test` and fails the build on any test failure

### Requirement: CI typechecks and builds the frontend
The `ci.yml` workflow SHALL run `npx tsc --noEmit` and `npm run build` in the `frontend/` directory to catch type errors and build failures before merge.

#### Scenario: TypeScript error fails CI
- **WHEN** a commit introduces a type error in the frontend
- **THEN** the CI `tsc --noEmit` step fails and blocks the merge

### Requirement: ESLint configuration exists and CI runs lint
An `eslint.config.mjs` (or `.eslintrc.json`) SHALL exist in `frontend/` so that `npm run lint` is functional. CI SHALL run `npm run lint`.

#### Scenario: lint runs without "no config found" error
- **WHEN** `npm run lint` is executed in `frontend/`
- **THEN** ESLint runs against the codebase using the configured ruleset (not a no-op)

### Requirement: CI scans Docker images for vulnerabilities
The `ci.yml` workflow SHALL include a container-vulnerability scan step (e.g., `aquasecurity/trivy-action`) on the built backend and frontend images, and SHALL fail on `CRITICAL` findings.

#### Scenario: critical CVE in image fails CI
- **WHEN** a built image contains a CRITICAL-severity vulnerability
- **THEN** the Trivy scan step fails the CI run

### Requirement: CI runs static analysis and secret scanning
The `ci.yml` workflow SHALL include `github/codeql-action` (SAST) and `gitleaks/gitleaks-action` (secret scanning) steps.

#### Scenario: hardcoded secret fails CI
- **WHEN** a commit introduces a hardcoded API key or password
- **THEN** the gitleaks step fails the CI run

### Requirement: micrometer-registry-prometheus dependency present
`build.gradle.kts` SHALL include `io.micrometer:micrometer-registry-prometheus` so that the already-exposed `/actuator/prometheus` endpoint returns metrics instead of 404.

#### Scenario: Prometheus endpoint returns metrics
- **WHEN** an authenticated user requests `GET /actuator/prometheus`
- **THEN** the response is `200 OK` with Prometheus-format text (not `404`)

### Requirement: Structured JSON logging in production profile
A `logback-spring.xml` SHALL exist that uses a JSON encoder (`logstash-logback-encoder`) for the `prod` Spring profile and a human-readable console encoder for the default/dev profile.

#### Scenario: production logs are JSON
- **WHEN** the application runs with `SPRING_PROFILES_ACTIVE=prod`
- **THEN** log output is valid JSON (one object per line, parseable by log aggregators)

#### Scenario: development logs remain human-readable
- **WHEN** the application runs without the `prod` profile
- **THEN** log output is colored console text (not JSON)

### Requirement: Actuator health details restricted
`management.endpoint.health.show-details` SHALL be `when-authorized` (not `always`), so that database driver, disk, and datasource URL details are visible only to authenticated privileged users, not to every technician.

#### Scenario: technician sees limited health info
- **WHEN** a `technician` requests `GET /actuator/health`
- **THEN** the response shows only `status: UP` without DB driver/disk details
