.PHONY: up down rebuild logs build test test-health check-java-version

up:
	docker compose up -d --build

down:
	docker compose down

rebuild:
	docker compose up -d --build backend

logs:
	docker compose logs -f backend

# Check JDK version (Kotlin 2.4.0 requires JDK 21+; the Gradle toolchain targets 21 as the floor)
check-java-version:
	@java_version=$$(java -version 2>&1 | head -1 | sed 's/.*version "\([0-9]*\)\..*/\1/'); \
	if [ "$$java_version" -lt 21 ]; then \
		echo "ERROR: Kotlin 2.4.0 requires JDK 21+ (detected JDK $$java_version)"; \
		echo "Install JDK 21 via SDKMAN!: sdk install java 21.0.8-tem"; \
		echo "Or use Docker: make docker-build"; \
		exit 1; \
	fi

# Build the Kotlin JAR locally (requires JDK 21)
build: check-java-version
	cd backend-kotlin-jpa && ./gradlew bootJar --no-daemon

# Run the Kotlin test suite (requires JDK 21)
test: check-java-version
	cd backend-kotlin-jpa && ./gradlew test --no-daemon

# Smoke-test the running backend
test-health:
	@echo "Testing health endpoint..."
	@curl -sf http://localhost:8001/api/health && echo " OK" || echo " FAILED"

# Login and get cookies
test-login:
	curl -c /tmp/cookies.txt -X POST http://localhost:8001/api/auth/login \
	  -H "Content-Type: application/json" -d '{"username":"tech1","password":"tech1"}' && echo

# Test authenticated endpoint (run test-login first)
test-expenses:
	curl -b /tmp/cookies.txt http://localhost:8001/api/expenses
