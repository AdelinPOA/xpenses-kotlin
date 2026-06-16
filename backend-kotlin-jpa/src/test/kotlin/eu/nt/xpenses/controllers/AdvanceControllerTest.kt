package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.models.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class AdvanceControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun makeTechReport(): ExpenseReport {
        val tech = userRepository.findByUsername("tech1")!!
        return expenseReportRepository.save(ExpenseReport(user = tech, title = "Advance Test Report"))
    }

    @Test
    fun `POST advance with type=request on own report returns 201 with status=requested`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/advances")
                .contentType(MediaType.APPLICATION_JSON)
                // type "request" = owner requesting an advance; saved status becomes "requested"
                .content("""{"type":"request","amount":200.0,"currency":"EUR"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.requested_amount").value(200.0))
            .andExpect(jsonPath("$.status").value("requested"))
    }

    @Test
    fun `GET advances on another technician report returns 403 (IDOR guard)`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()

        // Create a second technician mid-test; within @Transactional the created user is
        // visible to subsequent MockMvc calls in the same session (FlushMode.AUTO flushes
        // before JPQL queries, so loginAs can find "tech2idor" immediately).
        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech2idor","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                .cookie(modCookie)
        ).andExpect(status().isCreated)

        val tech2Cookie = authHelper.loginAs("tech2idor", "pass1234")
        mockMvc.perform(get("/api/reports/${report.id}/advances").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `manager can GET advances on any report`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(get("/api/reports/${report.id}/advances").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
    }

    @Test
    fun `GET advances without cookie returns 403 (Spring Security default for unauthenticated)`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()

        mockMvc.perform(get("/api/reports/${report.id}/advances"))
            .andExpect(status().isForbidden)
    }
}
