package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.AppSetting
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface AppSettingRepository : JpaRepository<AppSetting, String> {
    // Serializes catalog PATCH and test-result writes, including the first insert.
    // Call only inside a short transaction, never around provider network requests.
    @Query(value = "SELECT pg_advisory_xact_lock(hashtextextended('xpenses-ocr-config', 0))", nativeQuery = true)
    fun acquireOcrConfigLock()
}
