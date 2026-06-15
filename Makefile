.PHONY: up down rebuild logs build test-health

up:
	docker compose up -d --build

down:
	docker compose down

rebuild:
	docker compose up -d --build backend

logs:
	docker compose logs -f backend

# Build the Kotlin JAR locally (requires JDK 21)
build:
	cd backend-kotlin-jpa && ./gradlew bootJar --no-daemon

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
