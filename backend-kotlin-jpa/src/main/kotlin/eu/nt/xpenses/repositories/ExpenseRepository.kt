package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.Expense
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface ExpenseRepository : JpaRepository<Expense, Int> {
    fun findAllByUserId(userId: Int): List<Expense>
    fun findAllByReportId(reportId: Int): List<Expense>
    fun countByUserId(userId: Int): Long

    @Query("SELECT e FROM Expense e WHERE e.rawOcrText IS NOT NULL AND e.category IS NOT NULL")
    fun findAllWithOcrTrainingData(): List<Expense>

    @Query("""
        SELECT e FROM Expense e
        WHERE (:userId IS NULL OR e.user.id = :userId)
          AND (:status IS NULL OR e.status = :status)
          AND (:reportId IS NULL OR e.report.id = :reportId)
          AND (:categoryId IS NULL OR e.category.id = :categoryId)
          AND (:fromDate IS NULL OR e.date >= :fromDate)
          AND (:toDate IS NULL OR e.date <= :toDate)
        ORDER BY e.date DESC, e.id DESC
    """)
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
        ORDER BY e.date DESC, e.id DESC
    """)
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

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.report IS NULL AND e.user.id = :userId")
    fun findUnattachedByUserId(@Param("userId") userId: Int): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.status = :status")
    fun findAllByUserIdAndStatus(@Param("userId") userId: Int, @Param("status") status: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.date >= :fromDate AND e.date <= :toDate")
    fun findAllByDateBetween(@Param("fromDate") fromDate: String, @Param("toDate") toDate: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date >= :fromDate AND e.date <= :toDate")
    fun findAllByUserIdAndDateBetween(@Param("userId") userId: Int, @Param("fromDate") fromDate: String, @Param("toDate") toDate: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.date >= :fromDate")
    fun findAllByDateFrom(@Param("fromDate") fromDate: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date >= :fromDate")
    fun findAllByUserIdAndDateFrom(@Param("userId") userId: Int, @Param("fromDate") fromDate: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId AND e.date <= :toDate")
    fun findAllByUserIdAndDateTo(@Param("userId") userId: Int, @Param("toDate") toDate: String): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e ORDER BY e.createdAt DESC")
    fun findRecentExpenses(pageable: Pageable): List<Expense>

    @EntityGraph(attributePaths = ["user", "category"])
    @Query("SELECT e FROM Expense e WHERE e.user.id = :userId ORDER BY e.createdAt DESC")
    fun findRecentExpensesByUserId(@Param("userId") userId: Int, pageable: Pageable): List<Expense>

    @Query(value = "SELECT * FROM expenses WHERE deleted = true", nativeQuery = true)
    fun findDeletedAudit(): List<Expense>
}
