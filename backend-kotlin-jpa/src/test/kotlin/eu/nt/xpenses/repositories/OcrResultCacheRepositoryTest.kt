package eu.nt.xpenses.repositories

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.OcrResultCache
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import jakarta.persistence.EntityManager
import jakarta.persistence.PersistenceContext
import java.time.Instant
import java.time.temporal.ChronoUnit

class OcrResultCacheRepositoryTest : IntegrationTestBase() {

    @Autowired
    lateinit var cacheRepository: OcrResultCacheRepository

    @PersistenceContext
    lateinit var entityManager: EntityManager

    @Test
    fun `cache identity can be looked up and expired entries can be deleted`() {
        val entry = cacheRepository.saveAndFlush(
            OcrResultCache(
                sha256 = "a".repeat(64),
                provider = "gemini",
                model = "gemini-3.1-flash-lite",
                contractVersion = "1",
                resultJson = "{\"amount\":10.50}",
                lastUsedAt = Instant.now().minus(91, ChronoUnit.DAYS)
            )
        )

        val found = cacheRepository.findBySha256AndProviderAndModelAndContractVersion(
            entry.sha256, entry.provider, entry.model, entry.contractVersion
        )
        assertTrue(found.isPresent)

        entry.lastUsedAt = Instant.now()
        cacheRepository.saveAndFlush(entry)
        assertTrue(cacheRepository.findById(entry.id!!).get().lastUsedAt.isAfter(Instant.now().minusSeconds(5)))

        val expiredEntry = cacheRepository.saveAndFlush(
            OcrResultCache(
                sha256 = "c".repeat(64),
                provider = "gemini",
                model = "gemini-3.1-flash-lite",
                contractVersion = "1",
                resultJson = "{}",
                lastUsedAt = Instant.now().minus(91, ChronoUnit.DAYS)
            )
        )
        val deleted = cacheRepository.deleteExpiredBatch(Instant.now().minus(90, ChronoUnit.DAYS), 100)
        assertEquals(1, deleted)
        entityManager.clear()
        assertTrue(cacheRepository.findById(expiredEntry.id!!).isEmpty)
    }

    @Test
    fun `cache identity is unique and scan lock can be acquired`() {
        val identity = OcrResultCache(
            sha256 = "b".repeat(64),
            provider = "gemini",
            model = "gemini-3.1-flash-lite",
            contractVersion = "1",
            resultJson = "{}"
        )
        cacheRepository.saveAndFlush(identity)
        cacheRepository.acquireScanLock("ocr-cache-test-lock")

        assertThrows(DataIntegrityViolationException::class.java) {
            cacheRepository.saveAndFlush(
                OcrResultCache(
                    sha256 = identity.sha256,
                    provider = identity.provider,
                    model = identity.model,
                    contractVersion = identity.contractVersion,
                    resultJson = "{}"
                )
            )
        }
    }
}
