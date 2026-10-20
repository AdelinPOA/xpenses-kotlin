package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.ExpenseReviewOperation
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface ExpenseReviewOperationRepository : JpaRepository<ExpenseReviewOperation, Long> {
    fun findByUser_IdAndRequestKey(
        userId: Int,
        requestKey: String
    ): ExpenseReviewOperation?
}
