package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.Receipt
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.stereotype.Repository

@Repository
interface ReceiptRepository : JpaRepository<Receipt, Int> {
    fun findAllByExpenseId(expenseId: Int): List<Receipt>

    @Query("SELECT r.filePath FROM Receipt r WHERE r.filePath IS NOT NULL")
    fun findAllFilePaths(): List<String>
}
