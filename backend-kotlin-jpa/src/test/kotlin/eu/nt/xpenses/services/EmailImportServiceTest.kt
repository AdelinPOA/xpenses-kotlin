package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.ingestion.ImapIngestionLedger
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.CategoryRepository
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.OcrComparisonRepository
import eu.nt.xpenses.repositories.OcrResultCacheRepository
import eu.nt.xpenses.repositories.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.support.TransactionTemplate

class EmailImportServiceTest {
    private val mapper = ObjectMapper().registerKotlinModule()
    private val client = mock(OpenAiCompatibleClient::class.java)
    private val ocrService =
        OcrService(
            mock(AppSettingRepository::class.java),
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
