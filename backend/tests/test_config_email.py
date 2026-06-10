from xpenses.config import Settings


def test_smtp_settings_defaults():
    settings = Settings(_env_file=None) # Ignore actual .env for this test
    assert settings.smtp_host == "localhost"
    assert settings.smtp_port == 1025
    assert settings.smtp_user is None
    assert settings.smtp_pass is None
    assert settings.smtp_from == "noreply@nt-automation.eu"
    assert settings.emails_enabled is False
