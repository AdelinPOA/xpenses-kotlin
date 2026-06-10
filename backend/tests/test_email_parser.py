import pytest
from xpenses.services.email_import_service import parse_delegation_email


def test_parse_standard_german_delegation_email():
    email_text = """
Hello
 
Here the order for the job in Ukraine.
 
@Diana Dallanora - NewTech Automation: please organize all for Adelin – thanks!
 
 

 
 
@Popescu, Adelin Petrisor fyi the planned colleagues on site:

 
 
 
Folgende Daten zur Einplanung werden bestätigt:
 
Kundenauftrag            0007038319
 
Auftragsart              KR20
Positionstyp             Mechanical full installation, start-up,
Starttermin              20.04.2026
Endtermin                22.05.2026
Vorgang                  0545           DEJR-N-INB_ER1_Newtech
Arbeitsplatz             ER_MT          1049           Disposition Reinigungst. elektr.  KSE
Techniker                Popescu Adelin Petrisor
TechnPlatz               C374981        Lwiw 40kcph Ukraine Can line 1
Equipment
Typbezeichnung
Auftragsverantw.         Josef Rohrmayer
 
Tech. Ansprechpartner
Anrede                   Frau
Name                     Wladimir P
Funktion
Telefon
Email-Adresse
 
Kunde                    0022265695     PJSC CARLSBERG UKRAINE
Adresse                  Kleparivska Str., 18
                         79007          Lviv
                         Ukraine
 
Telefon                  32 2948002
"""
    result = parse_delegation_email(email_text)
    assert result is not None
    assert result["title"] == "Delegation: PJSC CARLSBERG UKRAINE (Lwiw 40kcph Ukraine Can line 1)"
    assert result["date_from"] == "2026-04-20"
    assert result["date_to"] == "2026-05-22"
    assert "Kundenauftrag: 0007038319" in result["description"]
    assert "Location: Lwiw 40kcph Ukraine Can line 1" in result["description"]
    assert "Task: Mechanical full installation, start-up," in result["description"]


def test_parse_delegation_email_missing_dates():
    email_text = """
Kundenauftrag            0007038319
Kunde                    0022265695     PJSC CARLSBERG UKRAINE
    """
    result = parse_delegation_email(email_text)
    assert result is None


def test_parse_delegation_email_invalid_date_format():
    email_text = """
Starttermin              20-04-2026
Endtermin                22/05/2026
Kundenauftrag            0007038319
    """
    result = parse_delegation_email(email_text)
    assert result is None


@pytest.mark.asyncio
async def test_process_incoming_email_e2e(pool):
    from xpenses.services.email_import_service import process_incoming_email

    email_text = """
Starttermin              20.04.2026
Endtermin                22.05.2026
Kundenauftrag            0007038319
Kunde                    0022265695     PJSC CARLSBERG UKRAINE
TechnPlatz               C374981        Lwiw
"""
    async with pool.acquire() as conn:
        # 1. Insert a temporary user
        await conn.execute(
            "INSERT INTO users (username, display_name, email, password_hash, role, auth_source) VALUES ($1, $2, $3, $4, $5, $6)",
            "testtech", "Test Tech", "testtech@nt-automation.eu", "hash", "technician", "local"
        )
        
        # 2. Process mock email
        success = await process_incoming_email("testtech@nt-automation.eu", email_text, conn)
        assert success is True
        
        # 3. Verify report creation
        reports = await conn.fetch("SELECT * FROM expense_reports WHERE user_id = (SELECT id FROM users WHERE username = 'testtech')")
        assert len(reports) == 1
        assert reports[0]["title"] == "Delegation: PJSC CARLSBERG UKRAINE (Lwiw)"
        assert reports[0]["date_from"] == "2026-04-20"
        assert reports[0]["date_to"] == "2026-05-22"
        assert "Kundenauftrag: 0007038319" in reports[0]["description"]
        
        # Cleanup
        await conn.execute("DELETE FROM expense_reports WHERE user_id = (SELECT id FROM users WHERE username = 'testtech')")
        await conn.execute("DELETE FROM users WHERE username = 'testtech'")

