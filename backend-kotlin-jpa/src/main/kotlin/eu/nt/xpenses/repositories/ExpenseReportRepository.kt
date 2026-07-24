package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.ExpenseReport
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.Optional

@Repository
interface ExpenseReportRepository : JpaRepository<ExpenseReport, Int> {
    fun findAllByUserId(userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.id = :id")
    fun findByIdWithExpenses(@Param("id") id: Int): Optional<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user ORDER BY r.id DESC")
    fun findAllWithExpenses(): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId ORDER BY r.id DESC")
    fun findAllByUserIdWithExpenses(@Param("userId") userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.status = :status ORDER BY r.id DESC")
    fun findAllByStatusWithExpenses(@Param("status") status: String): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId AND r.status = :status ORDER BY r.id DESC")
    fun findAllByUserIdAndStatusWithExpenses(@Param("userId") userId: Int, @Param("status") status: String): List<ExpenseReport>

    fun countByStatus(status: String): Long
    fun countByUserIdAndStatus(userId: Int, status: String): Long

    @Query("""
        SELECT r FROM ExpenseReport r
        WHERE (:userId IS NULL OR r.user.id = :userId)
          AND (:status IS NULL OR r.status = :status)
        ORDER BY r.createdAt DESC, r.id DESC
    """)
    @EntityGraph(attributePaths = ["user"])
    fun findAllWithFiltersPaged(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        pageable: Pageable
    ): Page<ExpenseReport>

    @Query(value = "SELECT * FROM expense_reports WHERE deleted = true", nativeQuery = true)
    fun findDeletedAudit(): List<ExpenseReport>
}
