package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.InventoryItem
import eu.nt.xpenses.models.InventoryRequest
import eu.nt.xpenses.repositories.InventoryItemRepository
import eu.nt.xpenses.repositories.InventoryRequestRepository
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class InventoryControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager
    @Autowired
    private lateinit var inventoryItemRepository: InventoryItemRepository
    @Autowired
    private lateinit var inventoryRequestRepository: InventoryRequestRepository

    private fun saveTechItem(): InventoryItem {
        val tech = userRepository.findByUsername("tech1")!!
        return inventoryItemRepository.save(
            InventoryItem(user = tech, name = "Laptop", description = "Company laptop", status = "active")
        )
    }

    @Test
    fun `GET items returns own items for non-privileged user`() {
        val tech = userRepository.findByUsername("tech1")!!
        inventoryItemRepository.save(InventoryItem(user = tech, name = "Laptop", status = "active"))
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/inventory").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            .andExpect(jsonPath("$[0].name").value("Laptop"))
    }

    @Test
    fun `POST item creates and returns 201`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/inventory")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Monitor","description":"External display","category":"Equipment"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.name").value("Monitor"))
            .andExpect(jsonPath("$.status").value("active"))
    }

    @Test
    fun `GET item by id returns 200`() {
        val item = saveTechItem()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/inventory/${item.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("Laptop"))
    }

    @Test
    fun `PATCH item updates and returns 200`() {
        val item = saveTechItem()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            patch("/api/inventory/${item.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Gaming Laptop","status":"active"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("Gaming Laptop"))
    }

    @Test
    fun `DELETE item returns 204`() {
        val item = saveTechItem()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(delete("/api/inventory/${item.id}").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `POST request creates and returns 201`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/inventory/requests")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"item_name":"Keyboard","quantity":2}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.item_name").value("Keyboard"))
            .andExpect(jsonPath("$.quantity").value(2))
            .andExpect(jsonPath("$.status").value("pending"))
    }

    @Test
    fun `POST approve request as manager returns 200`() {
        val tech = userRepository.findByUsername("tech1")!!
        val req = InventoryRequest(user = tech, itemName = "Mouse", quantity = 1, status = "pending")
        inventoryRequestRepository.save(req)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(post("/api/inventory/requests/${req.id}/approve").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.request.status").value("approved"))
    }

    @Test
    fun `POST reject request as manager returns 200`() {
        val tech = userRepository.findByUsername("tech1")!!
        val req = InventoryRequest(user = tech, itemName = "Mouse", quantity = 1, status = "pending")
        inventoryRequestRepository.save(req)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/inventory/requests/${req.id}/reject")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"reason":"Not needed"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("rejected"))
    }

    @Test
    fun `GET items without cookie returns 403`() {
        mockMvc.perform(get("/api/inventory"))
            .andExpect(status().isForbidden)
    }
}
