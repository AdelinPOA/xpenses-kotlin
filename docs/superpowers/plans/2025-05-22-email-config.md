# Email Configuration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add necessary dependencies for email sending and update the backend configuration with SMTP settings.

**Architecture:** Update `pyproject.toml` for dependencies and `config.py` for pydantic-settings based configuration.

**Tech Stack:** FastAPI, Pydantic, aiosmtplib

---

### Task 1: Update Dependencies

**Files:**
- Modify: `backend/pyproject.toml`

- [ ] **Step 1: Add dependencies to `backend/pyproject.toml`**

Add `aiosmtplib==3.0.1` and `email-validator==2.2.0` to the `dependencies` list.

```toml
dependencies = [
    "fastapi==0.115.2",
    "uvicorn[standard]==0.30.1",
    "asyncpg==0.30.0",
    "pydantic==2.9.2",
    "pydantic-settings==2.4.0",
    "python-multipart==0.0.9",
    "httpx==0.27.0",
    "aiofiles==24.1.0",
    "reportlab==4.2.5",
    "pypdf==4.3.1",
    "Pillow==10.4.0",
    "PyJWT==2.9.0",
    "bcrypt==4.2.1",
    "easyocr>=1.7",
    "pdf2image>=1.17",
    "ldap3>=2.9",
    "cryptography>=42",
    "aiosmtplib==3.0.1",
    "email-validator==2.2.0",
]
```

- [ ] **Step 2: Commit**

```bash
git add backend/pyproject.toml
git commit -m "chore: add email dependencies"
```

### Task 2: Update Configuration

**Files:**
- Modify: `backend/xpenses/config.py`
- Test: `backend/tests/test_config_email.py`

- [ ] **Step 1: Write the failing test**

```python
from xpenses.config import Settings

def test_smtp_settings_defaults():
    settings = Settings(_env_file=None) # Ignore actual .env for this test
    assert settings.smtp_host == "localhost"
    assert settings.smtp_port == 1025
    assert settings.smtp_user is None
    assert settings.smtp_pass is None
    assert settings.smtp_from == "noreply@nt-automation.eu"
    assert settings.emails_enabled is False
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pytest backend/tests/test_config_email.py`
Expected: FAIL with `AttributeError` for `smtp_host`.

- [ ] **Step 3: Update `backend/xpenses/config.py`**

```python
class Settings(BaseSettings):
    # ... existing fields ...
    mileage_rate_after_tax: float = 0.40

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    smtp_user: str | None = None
    smtp_pass: str | None = None
    smtp_from: str = "noreply@nt-automation.eu"
    emails_enabled: bool = False
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pytest backend/tests/test_config_email.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/xpenses/config.py
git commit -m "feat: add SMTP settings to config"
```

### Task 3: Verify Installation

- [ ] **Step 1: Run installation**

Run: `pip install -e backend/`
(Since we are in a dev environment, we use -e)

- [ ] **Step 2: Verify imports work**

```bash
python -c "import aiosmtplib; import email_validator; print('OK')"
```

- [ ] **Step 3: Remove test file**

```bash
rm backend/tests/test_config_email.py
```
(Wait, usually we keep tests. But this is just configuration verification. I'll keep it as a permanent test.)
Actually, I'll keep it in `backend/tests/test_settings.py` if it exists, or keep `test_config_email.py`.
There is a `backend/tests/test_settings.py` already. I'll append to it instead.

- [ ] **Step 4: Append to `backend/tests/test_settings.py` instead of creating new file**

- [ ] **Step 5: Final Commit**
```bash
git add backend/tests/test_settings.py
git commit -m "test: add email settings verification"
```
