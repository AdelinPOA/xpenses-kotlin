package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseVerificationState
import jakarta.persistence.LockModeType
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.math.BigDecimal

@Repository
interface ExpenseRepository : JpaRepository<Expense, Int> {
    fun findAllByUserId(userId: Int): List<Expense>

    fun findAllByReportId(reportId: Int): List<Expense>

    fun countByUserId(userId: Int): Long

    @Query("SELECT e.receiptPath FROM Expense e WHERE e.deleted = false AND e.receiptPath IS NOT NULL")
    fun findAllLegacyReceiptPaths(): List<String>

    @Query("SELECT e FROM Expense e WHERE e.rawOcrText IS NOT NULL AND e.category IS NOT NULL")
    fun findAllWithOcrTrainingData(): List<Expense>

    @Query(
        """
        SELECT e FROM Expense e
        LEFT JOIN e.report r
        LEFT JOIN e.category c
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (:status IS NULL OR e.status = :status)
          AND (:reportId IS NULL OR r.id = :reportId)
          AND (:categoryId IS NULL OR c.id = :categoryId)
          AND (:fromDate IS NULL OR e.date >= :fromDate)
          AND (:toDate IS NULL OR e.date <= :toDate)
          AND (:verificationState IS NULL OR e.verificationState = :verificationState)
          AND (CAST(:q AS string) IS NULL OR LOWER(e.merchant) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
               OR LOWER(e.description) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
        ORDER BY e.date DESC, e.id DESC
    """,
    )
    @EntityGraph(attributePaths = ["user", "category"])
    fun findAllWithFilters(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        @Param("reportId") reportId: Int?,
        @Param("categoryId") categoryId: Int?,
        @Param("fromDate") fromDate: String?,
        @Param("toDate") toDate: String?,
        @Param("q") q: String?,
        @Param("verificationState") verificationState: ExpenseVerificationState?,
    ): List<Expense>

    @Query(
        """
        SELECT e FROM Expense e
        LEFT JOIN e.report r
        LEFT JOIN e.category c
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (:status IS NULL OR e.status = :status)
          AND (:reportId IS NULL OR r.id = :reportId)
          AND (:categoryId IS NULL OR c.id = :categoryId)
          AND (:fromDate IS NULL OR e.date >= :fromDate)
          AND (:toDate IS NULL OR e.date <= :toDate)
          AND (:verificationState IS NULL OR e.verificationState = :verificationState)
          AND (CAST(:q AS string) IS NULL OR LOWER(e.merchant) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%'))
               OR LOWER(e.description) LIKE LOWER(CONCAT('%', CAST(:q AS string), '%')))
        ORDER BY e.date DESC, e.id DESC
    """,
    )
    @EntityGraph(attributePaths = ["user", "category"])
    fun findAllWithFiltersPaged(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        @Param("reportId") reportId: Int?,
        @Param("categoryId") categoryId: Int?,
        @Param("fromDate") fromDate: String?,
        @Param("toDate") toDate: String?,
        @Param("q") q: String?,
        @Param("verificationState") verificationState: ExpenseVerificationState?,
        pageable: Pageable,
    ): Page<Expense>

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT e FROM Expense e WHERE e.id = :expenseId")
    fun findByIdForReview(@Param("expenseId") expenseId: Int): Expense?

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.report IS NULL AND e.user.id = :userId")
    fun findUnattachedByUserId(
        @Param("userId") userId: Int,
    ): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.status = :status")
    fun findAllByUserIdAndStatus(
        @Param("userId") userId: Int,
        @Param("status") status: String,
    ): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.date >= :fromDate AND e.date <= :toDate")
    fun findAllByDateBetween(
        @Param("fromDate") fromDate: String,
        @Param("toDate") toDate: String,
    ): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date >= :fromDate AND e.date <= :toDate")
    fun findAllByUserIdAndDateBetween(
        @Param("userId") userId: Int,
        @Param("fromDate") fromDate: String,
        @Param("toDate") toDate: String,
    ): List<Expense>

    @Query("SELECT COALESCE(SUM(e.amountEur), 0) FROM Expense e WHERE e.date >= :fromDate")
    fun sumAmountEurByDateFrom(
        @Param("fromDate") fromDate: String,
    ): BigDecimal

    @Query(
        """
        SELECT c.id, c.name, SUM(e.amountEur), COUNT(e)
        FROM Expense e LEFT JOIN e.category c
        WHERE e.date >= :fromDate AND (:userId IS NULL OR e.user.id = :userId)
        GROUP BY c.id, c.name
        ORDER BY SUM(e.amountEur) DESC
    """,
    )
    fun spendByCategorySince(
        @Param("fromDate") fromDate: String,
        @Param("userId") userId: Int?,
    ): List<Array<Any>>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date <= :toDate")
    fun findAllByUserIdAndDateTo(
        @Param("userId") userId: Int,
        @Param("toDate") toDate: String,
    ): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e ORDER BY e.createdAt DESC")
    fun findRecentExpenses(pageable: Pageable): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId ORDER BY e.createdAt DESC")
    fun findRecentExpensesByUserId(
        @Param("userId") userId: Int,
        pageable: Pageable,
    ): List<Expense>

    @Query(value = "SELECT * FROM expenses WHERE deleted = true", nativeQuery = true)
    fun findDeletedAudit(): List<Expense>

    @Query(
        """
        SELECT e FROM Expense e
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (
            LOWER(e.merchant) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(e.description) LIKE LOWER(CONCAT('%', :term, '%'))
          )
        ORDER BY e.date DESC, e.id DESC
    """,
    )
    @EntityGraph(attributePaths = ["user", "category"])
    fun search(
        @Param("userId") userId: Int?,
        @Param("term") term: String,
    ): List<Expense>
}
