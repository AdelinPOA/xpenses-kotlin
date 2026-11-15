package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.report.review.ReviewQueueProjection
import org.springframework.data.domain.Page
import org.springframework.data.domain.Pageable
import org.springframework.data.jpa.repository.EntityGraph
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.Optional

@Repository
interface ExpenseReportRepository : JpaRepository<ExpenseReport, Int> {
    @Lock(jakarta.persistence.LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM ExpenseReport r WHERE r.id = :reportId")
    fun findByIdForOcrPromotion(@Param("reportId") reportId: Int): Optional<ExpenseReport>

    fun findAllByUserId(userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.id = :id")
    fun findByIdWithExpenses(@Param("id") id: Int): Optional<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user ORDER BY r.id DESC")
    fun findAllWithExpenses(): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId ORDER BY r.id DESC")
    fun findAllByUserIdWithExpenses(@Param("userId") userId: Int): List<ExpenseReport>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.status = :status ORDER BY r.id DESC")
    fun findAllByStatusWithExpenses(@Param("status") status: String): List<ExpenseReport>

    @Query("""
        SELECT new eu.nt.xpenses.report.review.ReviewQueueProjection(
            r.id,
            r.title,
            u.id,
            u.displayName,
            r.submittedAt,
            r.dateFrom,
            r.dateTo,
            r.description,
            COUNT(e),
            r.totalAmount,
            r.currency,
            r.status
        )
        FROM ExpenseReport r
        JOIN r.user u
        LEFT JOIN r.expenses e
        WHERE r.status = 'submitted'
          AND u.id <> :actorId
        GROUP BY r.id, r.title, u.id, u.displayName, r.submittedAt,
                 r.dateFrom, r.dateTo, r.description, r.totalAmount,
                 r.currency, r.status
        ORDER BY CASE WHEN r.submittedAt IS NULL THEN 1 ELSE 0 END,
                 r.submittedAt ASC,
                 r.id ASC
    """)
    fun findReviewQueue(@Param("actorId") actorId: Int): List<ReviewQueueProjection>

    @Query("SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user WHERE r.user.id = :userId AND r.status = :status ORDER BY r.id DESC")
    fun findAllByUserIdAndStatusWithExpenses(@Param("userId") userId: Int, @Param("status") status: String): List<ExpenseReport>

    fun countByStatus(status: String): Long
    fun countByUserIdAndStatus(userId: Int, status: String): Long
    fun findFirstByUserIdAndKundenauftragAndStatusOrderByIdDesc(
        userId: Int,
        kundenauftrag: String,
        status: String,
    ): ExpenseReport?

    @Query("SELECT r.status, COUNT(r) FROM ExpenseReport r WHERE (:userId IS NULL OR r.user.id = :userId) GROUP BY r.status")
    fun countByStatusGrouped(@Param("userId") userId: Int?): List<Array<Any>>

    @EntityGraph(attributePaths = ["user"])
    @Query("SELECT r FROM ExpenseReport r ORDER BY r.id DESC")
    fun findLatestWithExpenses(pageable: Pageable): List<ExpenseReport>

    @EntityGraph(attributePaths = ["user"])
    @Query("SELECT r FROM ExpenseReport r WHERE r.user.id = :userId ORDER BY r.id DESC")
    fun findLatestByUserIdWithExpenses(@Param("userId") userId: Int, pageable: Pageable): List<ExpenseReport>

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

    @Query("""
        SELECT DISTINCT r FROM ExpenseReport r LEFT JOIN FETCH r.expenses LEFT JOIN FETCH r.user
        WHERE (:userId IS NULL OR r.user.id = :userId)
          AND (
            LOWER(r.title) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(r.user.displayName) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(r.kundenauftrag) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(r.kundeCode) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(r.kundeName) LIKE LOWER(CONCAT('%', :term, '%'))
            OR LOWER(r.adresse) LIKE LOWER(CONCAT('%', :term, '%'))
          )
        ORDER BY r.createdAt DESC, r.id DESC
    """)
    fun search(
        @Param("userId") userId: Int?,
        @Param("term") term: String
    ): List<ExpenseReport>
}
