package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.InventoryRequest
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface InventoryRequestRepository : JpaRepository<InventoryRequest, Int> {
    fun findAllByUserId(userId: Int): List<InventoryRequest>
    fun findAllByUserIdOrderByCreatedAtDesc(userId: Int): List<InventoryRequest>
    fun findAllByStatus(status: String): List<InventoryRequest>
    fun findAllByUserIdAndStatus(userId: Int, status: String): List<InventoryRequest>
    fun findAllByOrderByCreatedAtDesc(): List<InventoryRequest>
}
