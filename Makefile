.PHONY: test lint lint-fix up down rebuild logs

test:
	docker compose exec backend pytest tests/ -v

test-quick:
	docker compose exec backend pytest tests/ -v -x --tb=short

lint:
	docker compose exec backend ruff check xpenses/ tests/

lint-fix:
	docker compose exec backend ruff check --fix xpenses/ tests/

up:
	docker compose up -d --build

down:
	docker compose down

rebuild:
	docker compose up -d --build backend

logs:
	docker compose logs -f backend

# Coverage and formatting
test-cov:
	docker compose exec backend pytest tests/ --cov=xpenses --cov-report=term-missing

format:
	docker compose exec backend pre-commit run --all-files
