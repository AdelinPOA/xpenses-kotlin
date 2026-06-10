from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio

from xpenses.config import settings
from xpenses.services.email_service import send_email


@pytest_asyncio.fixture(scope="session", autouse=True)
async def test_db():
    # Override session fixture from conftest.py
    yield

@pytest_asyncio.fixture(autouse=True)
async def clean_tables():
    # Override autouse fixture from conftest.py
    yield

@pytest.mark.asyncio
async def test_send_email_calls_aiosmtplib():
    with patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send:
        # Temporarily enable emails
        settings.emails_enabled = True
        await send_email("test@example.com", "Subject", "Body")
        mock_send.assert_called_once()

        # Verify message construction
        args, kwargs = mock_send.call_args
        message = args[0]
        assert message["To"] == "test@example.com"
        assert message["Subject"] == "Subject"
        assert message.get_content().strip() == "Body"

        # Reset
        settings.emails_enabled = False

@pytest.mark.asyncio
async def test_send_email_disabled():
    with patch("aiosmtplib.send", new_callable=AsyncMock) as mock_send:
        # Ensure emails are disabled
        settings.emails_enabled = False
        await send_email("test@example.com", "Subject", "Body")
        mock_send.assert_not_called()

@pytest.mark.asyncio
async def test_send_email_error_handling():
    with patch("aiosmtplib.send", side_effect=Exception("SMTP error")) as mock_send:
        with patch("xpenses.services.email_service.logger") as mock_logger:
            settings.emails_enabled = True
            await send_email("test@example.com", "Subject", "Body")
            mock_send.assert_called_once()
            mock_logger.error.assert_called_once()
            assert "Failed to send email to test@example.com: SMTP error" in mock_logger.error.call_args[0][0]
            settings.emails_enabled = False
