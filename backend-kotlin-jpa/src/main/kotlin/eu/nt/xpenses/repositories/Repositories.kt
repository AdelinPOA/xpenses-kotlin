package eu.nt.xpenses.repositories

import eu.nt.xpenses.models.*
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.Optional
import org.springframework.data.jpa.repository.Modifying
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal


@Repository
interface UserRepository : JpaRepository<User, Int> {
    fun findByUsername(username: String): User?
}

@Repository
interface CategoryRepository : JpaRepository<Category, Int> {
    fun findByName(name: String): Category?
    fun findAllByIsActiveTrue(): List<Category>
}

@Repository
interface ExpenseReportRepository : JpaRepository<ExpenseReport, Int> {
    fun findAllByUserId(userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.id = :id")
    fun findByIdWithExpenses(@Param("id") id: Int): Optional<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user")
    fun findAllWithExpenses(): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId")
    fun findAllByUserIdWithExpenses(@Param("userId") userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.status = :status")
    fun findAllByStatusWithExpenses(@Param("status") status: String): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId AND r.status = :status")
    fun findAllByUserIdAndStatusWithExpenses(@Param("userId") userId: Int, @Param("status") status: String): List<ExpenseReport>

    @Query(value = "SELECT * FROM expense_reports WHERE deleted = true", nativeQuery = true)
    fun findDeletedAudit(): List<ExpenseReport>
}

@Repository
interface ExpenseRepository : JpaRepository<Expense, Int> {
    fun findAllByUserId(userId: Int): List<Expense>
    fun findAllByReportId(reportId: Int): List<Expense>

    @Query("""
        SELECT e FROM Expense e
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (:status IS NULL OR e.status = :status)
          AND (:reportId IS NULL OR e.report.id = :reportId)
          AND (:categoryId IS NULL OR e.category.id = :categoryId)
          AND (:fromDate IS NULL OR e.date >= :fromDate)
          AND (:toDate IS NULL OR e.date <= :toDate)
        ORDER BY e.date DESC
    """)
    // Eager-join the to-one relations (user, category) to avoid N+1 during DTO mapping.
    // The receipts collection is intentionally excluded — it is resolved via Hibernate's
    // default_batch_fetch_size, which keeps pagination correct (a collection fetch join
    // would force Hibernate to paginate in memory: HHH000104).
    @EntityGraph(attributePaths = ["user", "category"])
    fun findAllWithFilters(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        @Param("reportId") reportId: Int?,
        @Param("categoryId") categoryId: Int?,
        @Param("fromDate") fromDate: String?,
        @Param("toDate") toDate: String?
    ): List<Expense>

    @Query("""
        SELECT e FROM Expense e
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (:status IS NULL OR e.status = :status)
          AND (:reportId IS NULL OR e.report.id = :reportId)
          AND (:categoryId IS NULL OR e.category.id = :categoryId)
          AND (:fromDate IS NULL OR e.date >= :fromDate)
          AND (:toDate IS NULL OR e.date <= :toDate)
    """)
    // See findAllWithFilters: to-one relations are join-fetched here; the receipts
    // collection is left to default_batch_fetch_size so pagination stays at the DB level.
    @EntityGraph(attributePaths = ["user", "category"])
    fun findAllWithFiltersPaged(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        @Param("reportId") reportId: Int?,
        @Param("categoryId") categoryId: Int?,
        @Param("fromDate") fromDate: String?,
        @Param("toDate") toDate: String?,
        pageable: Pageable
    ): Page<Expense>

    @Query("SELECT e FROM Expense e WHERE e.report IS NULL AND e.user.id = :userId")
    fun findUnattachedByUserId(@Param("userId") userId: Int): List<Expense>

    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.status = :status")
    fun findAllByUserIdAndStatus(@Param("userId") userId: Int, @Param("status") status: String): List<Expense>

    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date >= :fromDate AND e.date <= :toDate")
    fun findAllByUserIdAndDateBetween(@Param("userId") userId: Int, @Param("fromDate") fromDate: String, @Param("toDate") toDate: String): List<Expense>

    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date >= :fromDate")
    fun findAllByUserIdAndDateFrom(@Param("userId") userId: Int, @Param("fromDate") fromDate: String): List<Expense>

    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date <= :toDate")
    fun findAllByUserIdAndDateTo(@Param("userId") userId: Int, @Param("toDate") toDate: String): List<Expense>

    @Query(value = "SELECT * FROM expenses WHERE deleted = true", nativeQuery = true)
    fun findDeletedAudit(): List<Expense>
}

@Repository
interface ReceiptRepository : JpaRepository<Receipt, Int> {
    fun findAllByExpenseId(expenseId: Int): List<Receipt>
}

@Repository
interface FxRateRepository : JpaRepository<FxRate, Int> {
    fun findByFromCurrencyAndToCurrencyAndRateDate(
        fromCurrency: String,
        toCurrency: String,
        rateDate: String
    ): FxRate?
}

@Repository
interface RefreshTokenRepository : JpaRepository<RefreshToken, Int> {
    fun findByTokenHash(tokenHash: String): RefreshToken?
    fun deleteByUserId(userId: Int)
}

@Repository
interface AdvancePaymentRepository : JpaRepository<AdvancePayment, Int> {
    fun findAllByReportId(reportId: Int): List<AdvancePayment>
    fun findAllByUserId(userId: Int): List<AdvancePayment>
    fun findAllByStatus(status: String): List<AdvancePayment>
}

@Repository
interface MileageRecordRepository : JpaRepository<MileageRecord, Int> {
    fun findAllByReportId(reportId: Int): List<MileageRecord>
    fun findAllByUserId(userId: Int): List<MileageRecord>
}

@Repository
interface AppSettingRepository : JpaRepository<AppSetting, String> {
    // findById acts as findByKey since key is the primary key @Id
}

@Repository
interface OcrComparisonRepository : JpaRepository<OcrComparison, Int> {
    @Query("SELECT o FROM OcrComparison o LEFT JOIN FETCH o.expense ORDER BY o.createdAt DESC")
    fun findAllOrdered(): List<OcrComparison>

    @Query("SELECT o FROM OcrComparison o LEFT JOIN FETCH o.expense WHERE o.sha256 = :sha256 ORDER BY CASE WHEN o.expense IS NOT NULL THEN 1 WHEN o.easyocrAmount IS NOT NULL OR o.geminiAmount IS NOT NULL OR o.mineruAmount IS NOT NULL THEN 2 ELSE 3 END ASC, o.id DESC")
    fun findBestCachedComparison(@Param("sha256") sha256: String): List<OcrComparison>

    @Modifying
    @Transactional
    @Query("UPDATE OcrComparison o SET o.easyocrAmount = :amount, o.easyocrDate = :date, o.easyocrMerchant = :merchant, o.easyocrCategoryId = :categoryId, o.easyocrError = :error WHERE o.id = :id")
    fun updateEasyOcrResult(
        @Param("id") id: Int,
        @Param("amount") amount: BigDecimal?,
        @Param("date") date: String?,
        @Param("merchant") merchant: String?,
        @Param("categoryId") categoryId: Int?,
        @Param("error") error: String?
    )

    @Modifying
    @Transactional
    @Query("UPDATE OcrComparison o SET o.mineruAmount = :amount, o.mineruDate = :date, o.mineruMerchant = :merchant, o.mineruCategoryId = :categoryId, o.mineruError = :error WHERE o.id = :id")
    fun updateMineruResult(
        @Param("id") id: Int,
        @Param("amount") amount: BigDecimal?,
        @Param("date") date: String?,
        @Param("merchant") merchant: String?,
        @Param("categoryId") categoryId: Int?,
        @Param("error") error: String?
    )

    @Modifying
    @Transactional
    @Query("UPDATE OcrComparison o SET o.geminiAmount = :amount, o.geminiDate = :date, o.geminiMerchant = :merchant, o.geminiCategoryId = :categoryId, o.geminiError = :error WHERE o.id = :id")
    fun updateGeminiResult(
        @Param("id") id: Int,
        @Param("amount") amount: BigDecimal?,
        @Param("date") date: String?,
        @Param("merchant") merchant: String?,
        @Param("categoryId") categoryId: Int?,
        @Param("error") error: String?
    )
}

@Repository
interface InventoryItemRepository : JpaRepository<InventoryItem, Int> {
    fun findAllByUserId(userId: Int): List<InventoryItem>
    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InventoryItem>
    fun findAllByOrderByCreatedAtDesc(): List<InventoryItem>
}

@Repository
interface InventoryRequestRepository : JpaRepository<InventoryRequest, Int> {
    fun findAllByUserId(userId: Int): List<InventoryRequest>
    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InventoryRequest>
    fun findAllByStatus(status: String): List<InventoryRequest>
    fun findAllByUserIdAndStatus(userId: Int, status: String): List<InventoryRequest>
    fun findAllByOrderByCreatedAtDesc(): List<InventoryRequest>
}

@Repository
interface InsuranceFileRepository : JpaRepository<InsuranceFile, Int> {
    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InsuranceFile>
    fun findAllByOrderByCreatedAtDesc(): List<InsuranceFile>
}
interface OcrJobRepository : JpaRepository<OcrJob, Int>
