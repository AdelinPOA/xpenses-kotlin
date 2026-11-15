package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrComparison
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal

@Repository
interface OcrComparisonRepository : JpaRepository<OcrComparison, Int> {
    @Query("SELECT o FROM OcrComparison o LEFT JOIN FETCH o.expense e LEFT JOIN FETCH e.category ORDER BY o.createdAt DESC")
    fun findAllOrdered(): List<OcrComparison>

    @Query("SELECT o FROM OcrComparison o LEFT JOIN FETCH o.expense e LEFT JOIN FETCH e.category ORDER BY o.createdAt DESC")
    fun findAllOrdered(pageable: Pageable): List<OcrComparison>

    @Query("SELECT o FROM OcrComparison o LEFT JOIN FETCH o.expense WHERE o.sha256 = :sha256 ORDER BY CASE WHEN o.expense IS NOT NULL THEN 1 WHEN o.geminiAmount IS NOT NULL THEN 2 ELSE 3 END ASC, o.id DESC")
    fun findBestCachedComparison(@Param("sha256") sha256: String): List<OcrComparison>

    @Modifying
    @Transactional
    @Query("UPDATE OcrComparison o SET o.geminiAmount = :amount, o.geminiDate = :date, o.geminiMerchant = :merchant, o.geminiCategoryId = :categoryId, o.geminiError = :error, o.provider = COALESCE(:provider, o.provider) WHERE o.id = :id")
    fun updateGeminiResult(
        @Param("id") id: Int,
        @Param("amount") amount: BigDecimal?,
        @Param("date") date: String?,
        @Param("merchant") merchant: String?,
        @Param("categoryId") categoryId: Int?,
        @Param("error") error: String?,
        @Param("provider") provider: String?
    )
}
