package eu.nt.xpenses.repositories

import eu.nt.xpenses.models.Report
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.util.Optional

@Repository
interface ReportRepository : JpaRepository<Report, Long> {

    // Eagerly fetches a single report along with its expenses in one query
    @Query("SELECT r FROM Report r LEFT JOIN FETCH r.expenses WHERE r.id = :id")
    fun findByIdWithExpenses(@Param("id") id: Long): Optional<Report>

    // Eagerly fetches all reports along with their expenses in one query (using DISTINCT to prevent Cartesian product duplicates)
    @Query("SELECT DISTINCT r FROM Report r LEFT JOIN FETCH r.expenses")
    fun findAllWithExpenses(): List<Report>
}
