package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
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

    @Test
    fun `paid advance persists resolved rate and GET does not resolve again`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("USD", "2024-02-03"))
            .thenReturn(java.math.BigDecimal("0.8734"))

        mockMvc.perform(
            post("/api/reports/${report.id}/advances")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"paid","amount":100.00,"currency":"USD","date":"2024-02-03"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.fx_rate").value(0.8734))
            .andExpect(jsonPath("$.amount_eur").value(87.34))
            .andExpect(jsonPath("$.date").value("2024-02-03"))

        verify(fxService).getRate("USD", "2024-02-03")
        clearInvocations(fxService)

        mockMvc.perform(get("/api/reports/${report.id}/advances").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].fx_rate").value(0.8734))
            .andExpect(jsonPath("$[0].amount_eur").value(87.34))

        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `paying requested advance resolves with payment values`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")

        val createResult = mockMvc.perform(
            post("/api/reports/${report.id}/advances")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"request","amount":200.00,"currency":"USD"}""")
                .cookie(techCookie)
        )
            .andExpect(status().isCreated)
            .andReturn()
        val advanceId = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
            .readTree(createResult.response.contentAsString).get("id").asInt()

        org.mockito.Mockito.`when`(fxService.getRate("GBP", "2024-03-04"))
            .thenReturn(java.math.BigDecimal("1.2345"))
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/reports/${report.id}/advances/$advanceId/pay")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"amount":50.00,"currency":"GBP","date":"2024-03-04"}""")
                .cookie(managerCookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("paid"))
            .andExpect(jsonPath("$.fx_rate").value(1.2345))
            .andExpect(jsonPath("$.amount_eur").value(61.73))
            .andExpect(jsonPath("$.date").value("2024-03-04"))

        verify(fxService).getRate("GBP", "2024-03-04")
    }

    @Test
    fun `updating paid advance resolves with resulting currency date and amount`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("USD", "2024-02-03"))
            .thenReturn(java.math.BigDecimal("0.90"))
        val createResult = mockMvc.perform(
            post("/api/reports/${report.id}/advances")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"type":"paid","amount":100.00,"currency":"USD","date":"2024-02-03"}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val advanceId = com.fasterxml.jackson.module.kotlin.jacksonObjectMapper()
            .readTree(createResult.response.contentAsString).get("id").asInt()
        clearInvocations(fxService)

        org.mockito.Mockito.`when`(fxService.getRate("CHF", "2024-04-05"))
            .thenReturn(java.math.BigDecimal("1.1111"))

        mockMvc.perform(
            patch("/api/reports/${report.id}/advances/$advanceId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"amount":25.00,"currency":"CHF","date":"2024-04-05"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.fx_rate").value(1.1111))
            .andExpect(jsonPath("$.amount_eur").value(27.78))
            .andExpect(jsonPath("$.date").value("2024-04-05"))

        verify(fxService).getRate("CHF", "2024-04-05")
    }
}
