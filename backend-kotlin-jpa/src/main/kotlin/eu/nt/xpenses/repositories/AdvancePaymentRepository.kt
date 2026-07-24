package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.AdvancePayment
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface AdvancePaymentRepository : JpaRepository<AdvancePayment, Int> {
    fun findAllByReportId(reportId: Int): List<AdvancePayment>
    fun findAllByUserId(userId: Int): List<AdvancePayment>
    fun findAllByStatus(status: String): List<AdvancePayment>
}
