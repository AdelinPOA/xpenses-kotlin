package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.jacksonMapperBuilder
import eu.nt.xpenses.ingestion.ImapIngestionLedger
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrResultCacheRepository
import eu.nt.xpenses.repositories.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.mockito.Mockito.`when`
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate
import java.util.Optional

class EmailImportServiceTest {
    private val mapper = jacksonMapperBuilder().build()
    private val client = mock(OpenAiCompatibleClient::class.java)
    private val settingsRepository = mock(AppSettingRepository::class.java)
    private val parsingSettingsService = DelegationParsingSettingsService(settingsRepository, mapper)
    private val ocrService =
        OcrService(
            settingsRepository,
            mock(CategoryRepository::class.java),
            mock(OcrComparisonRepository::class.java),
            mock(OcrResultCacheRepository::class.java),
            mock(CryptoService::class.java),
            mapper,
            TransactionTemplate(mock(PlatformTransactionManager::class.java)),
            client,
        )
    private val service =
        EmailImportService(
            mock(UserRepository::class.java),
            mock(ExpenseReportRepository::class.java),
            ocrService,
            mapper,
            mock(ImapIngestionLedger::class.java),
            parsingSettingsService,
        )
    private val config =
        OCRConfig(
            providers = listOf(OCRProviderConfig("p", "Provider", "https://8.8.8.8/v1")),
            models =
                listOf(
                    OCRModelConfig("primary", "p", "email-primary", "Primary", active = true, tested = true),
                    OCRModelConfig("fallback", "p", "email-fallback", "Fallback", active = true, tested = true),
                ),
            delegationModelChain = listOf("primary", "fallback"),
        )

    private val orderEmail =
        """
        Auftrag                  905652178
        Auftragsart              SOAW
        Starttermin              18.10.2026
        Endtermin                19.10.2026
        Vorgang                  0020           MBi-G-dosing-cooling-tower
        Arbeitsplatz             ER_MT          1049           Disposition Reinigungst. elektr. KSE
        Techniker                Example Technician
        TechnPlatz               C373947        Can Line 60.000 cph@0,45l
        Kunde                    0022316798     Example Brewery LLP
        Adresse                  Almaty Gebiet, Promzona Nr.289
                                 040702         Example village
                                 Kasachstan

        Telefon                  727-3210000
        """.trimIndent()

    @Test
    fun `German order email uses English instructions and maps both order labels`() {
        var prompt = ""
        doAnswer { invocation ->
            prompt = invocation.arguments[2] as String
            """{"title":"Delegation: Example Brewery","date_from":"2026-10-18","date_to":"2026-10-19","description":"Cooling tower maintenance","kundenauftrag":"905652178"}"""
        }.`when`(client).complete(
            any(OCRProviderConfig::class.java) ?: config.providers.first(),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        service.parseDelegationEmailWithModels(orderEmail, config)

        assertTrue(prompt.contains("English"), "Email model must be instructed to produce English output")
        assertTrue(prompt.contains("Kundenauftrag") && prompt.contains("Auftrag"), "Both order labels must map to the order number")
        listOf(orderEmail, orderEmail.replace("Auftrag ", "Kundenauftrag ")).forEach { email ->
            val parsed = service.parseDelegationEmailLocal(email)!!
            assertEquals("905652178", parsed["kundenauftrag"])
            assertTrue(parsed.getValue("description").startsWith("Order nr: 905652178"))
            assertEquals("2026-10-18", parsed["date_from"])
            assertEquals("2026-10-19", parsed["date_to"])
        }
    }

    @Test
    fun `HTML table email preserves order dates and multiline address without contact fields`() {
        val html =
            """
            <html><head><style>.hidden { display: none }</style></head><body>
            <table>
            <tr><td><p>Auftrag</p></td><td><p>000905652178</p></td></tr>
            <tr><td>Starttermin</td><td>18.10.2026</td></tr>
            <tr><td>Endtermin</td><td>19.10.2026</td></tr>
            <tr><td>Kunde</td><td>0022316798&nbsp;Example Brewery LLP</td></tr>
            <tr><td>Adresse</td><td><p>Industrial Street 289</p><p>040702 Example village</p><p>Kazakhstan</p></td></tr>
            <tr><td>Telefon</td><td>727-3210000</td></tr>
            </table><script>Auftrag 999</script></body></html>
            """.trimIndent()
        val parsed = service.parseDelegationEmailLocal(html)!!

        assertEquals("000905652178", parsed["kundenauftrag"])
        assertEquals("2026-10-18", parsed["date_from"])
        assertEquals("2026-10-19", parsed["date_to"])
        assertEquals("Industrial Street 289, 040702 Example village, Kazakhstan", parsed["adresse"])
        assertEquals("Example Brewery LLP", parsed["kunde_name"])
        assertFalse(parsed.getValue("description").contains("999"))
    }

    @Test
    fun `unsaved guidance is applied and source order number is restored ahead of description`() {
        var prompt = ""
        doAnswer { invocation ->
            prompt = invocation.arguments[2] as String
            """{"title":"Delegation: Example Brewery","date_from":"2026-10-18","date_to":"2026-10-19","description":"Cooling tower maintenance"}"""
        }.`when`(client).complete(
            any(OCRProviderConfig::class.java) ?: config.providers.first(),
            anyString(),
            anyString(),
            any<Any?>(),
        )
        val settings = DelegationParsingConfig("Identify the equipment", "Example: Auftrag 00123", "One detail per line")

        val parsed = service.parseDelegationEmailWithModels(orderEmail, config, settings)!!

        assertTrue(prompt.contains(settings.instructions))
        assertTrue(prompt.contains(settings.examples))
        assertTrue(prompt.contains(settings.outputInstructions))
        assertEquals("905652178", parsed["kundenauftrag"])
        assertEquals("Order nr: 905652178\nCooling tower maintenance", parsed["description"])
    }

    @Test
    fun `saved GUI guidance reaches the real ingestion parser`() {
        val stored = mutableMapOf("ocr_config" to AppSetting("ocr_config", mapper.writeValueAsString(config)))
        `when`(settingsRepository.findById(anyString())).thenAnswer { Optional.ofNullable(stored[it.arguments[0]]) }
        doAnswer { invocation ->
            val setting = invocation.arguments[0] as AppSetting
            stored[setting.key] = setting
            setting
        }.`when`(settingsRepository).save(any(AppSetting::class.java))
        val guidance = DelegationParsingConfig("Include equipment in the title", "Example order mapping", "Separate details with newlines")
        parsingSettingsService.saveConfig(guidance)
        var prompt = ""
        doAnswer { invocation ->
            prompt = invocation.arguments[2] as String
            """{"title":"Delegation: Cooling tower","date_from":"2026-10-18","date_to":"2026-10-19","description":"Maintenance"}"""
        }.`when`(client).complete(
            any(OCRProviderConfig::class.java) ?: config.providers.first(),
            anyString(),
            anyString(),
            any<Any?>(),
        )

        val parsed = service.parseDelegationEmailAsync(orderEmail)!!

        assertTrue(prompt.contains(guidance.instructions))
        assertTrue(prompt.contains(guidance.examples))
        assertTrue(prompt.contains(guidance.outputInstructions))
        assertEquals("Order nr: 905652178\nMaintenance", parsed["description"])
        assertEquals(config, mapper.readValue(stored.getValue("ocr_config").value, OCRConfig::class.java))
    }

    @Test
    fun `explicit order label takes precedence over prose starting with Order`() {
        val email = "Order for the next service trip\n" + orderEmail
        assertEquals("905652178", service.parseDelegationEmailLocal(email)?.get("kundenauftrag"))
        assertEquals("000905652178", DelegationEmailText.orderNumber("Auftrag:000905652178"))
    }

    @Test
    fun `delegation parsing falls back on invalid calendar dates reversed dates or missing title`() {
        listOf(
            """{"title":"Broken","date_from":"2025-99-99","date_to":"2025-01-02","description":"Trip"}""",
            """{"title":"Broken","date_from":"2025-01-03","date_to":"2025-01-02","description":"Trip"}""",
            """{"title":" ","date_from":"2025-01-01","date_to":"2025-01-02","description":"Trip"}""",
        ).forEach { invalid ->
            val attempted = mutableListOf<String>()
            doAnswer { invocation ->
                val model = invocation.arguments[1] as String
                attempted.add(model)
                if (model == "email-primary") {
                    invalid
                } else {
                    """{"title":"Valid trip","date_from":"2025-01-01","date_to":"2025-01-02","description":"Trip"}"""
                }
            }.`when`(client).complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("p", "p", "https://8.8.8.8/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            )

            val result = service.parseDelegationEmailWithModels("Synthetic email", config)

            assertEquals(listOf("email-primary", "email-fallback"), attempted)
            assertEquals("Valid trip", result?.get("title"))
            assertEquals("2025-01-01", result?.get("date_from"))
        }
    }
}
