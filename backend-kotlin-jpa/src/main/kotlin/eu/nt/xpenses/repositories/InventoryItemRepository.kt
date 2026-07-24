package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.InventoryItem
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface InventoryItemRepository : JpaRepository<InventoryItem, Int> {
    fun findAllByUserId(userId: Int): List<InventoryItem>
    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InventoryItem>
    fun findAllByOrderByCreatedAtDesc(): List<InventoryItem>
}
