package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.InsuranceFile
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface InsuranceFileRepository : JpaRepository<InsuranceFile, Int> {
    @Query("SELECT f.filePath FROM InsuranceFile f WHERE f.filePath IS NOT NULL")
    fun findAllFilePaths(): List<String>

    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InsuranceFile>

    fun findAllByOrderByCreatedAtDesc(): List<InsuranceFile>
}
