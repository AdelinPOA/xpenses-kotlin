## ADDED Requirements

### Requirement: .java-version file for SDKMAN! compatibility
A `.java-version` file at the repo root SHALL contain `21`, enabling automatic JDK switching for SDKMAN!, jEnv, and asdf-java users.

#### Scenario: SDKMAN! auto-switches to JDK 21
- **WHEN** a developer with SDKMAN! cd's into the repo
- **THEN** SDKMAN! reads `.java-version` and activates JDK 21

### Requirement: make check-java-version target
A Makefile target SHALL detect the host JDK version and exit with code 1 if it is not 21 or 22, printing clear guidance with SDKMAN! install instructions and Docker workaround.

#### Scenario: JDK 25 detected
- **WHEN** `make check-java-version` runs on JDK 25
- **THEN** output includes `ERROR: Kotlin 2.1.0 requires JDK 21 or 22 (detected JDK 25)` and exits with code 1

#### Scenario: JDK 21 detected
- **WHEN** `make check-java-version` runs on JDK 21
- **THEN** it exits silently with code 0

## MODIFIED Requirements

### Requirement: make build includes JDK check
The `build` Makefile target SHALL depend on `check-java-version`, so it fails early with a clear message instead of a cryptic Kotlin internal compiler error.

#### Scenario: build fails early on wrong JDK
- **WHEN** `make build` runs on JDK 25
- **THEN** `check-java-version` runs first and exits with error before Gradle starts

### Requirement: README documents JDK requirements
A "Local Development Requirements" section in README.md SHALL state JDK 21/22 requirements with SDKMAN! install commands and Docker alternative.

#### Scenario: developer reads Local Development section
- **WHEN** a developer reads the README
- **THEN** they see JDK version requirements, SDKMAN! commands, and Docker workaround
