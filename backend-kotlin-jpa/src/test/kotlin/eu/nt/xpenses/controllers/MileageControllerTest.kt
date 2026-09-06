package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.clearInvocations
import org.mockito.Mockito.times
import org.mockito.Mockito.verify
import java.math.BigDecimal
import java.time.Instant

class MileageControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun makeTechReport(): ExpenseReport {
        val tech = userRepository.findByUsername("tech1")!!
        return expenseReportRepository.save(ExpenseReport(user = tech, title = "Mileage Test Report"))
    }

    private val startTime = Instant.parse("2026-06-01T08:00:00Z")
    private val endTime = Instant.parse("2026-06-01T09:30:00Z")
    private val mileageBody = """{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","description":"Site visit"}"""

    @Test
    fun `GET mileage on own report returns 200`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
    }

    @Test
    fun `POST mileage on own draft report returns 201`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.origin").value("Office"))
            .andExpect(jsonPath("$.destination").value("Client"))
            .andExpect(jsonPath("$.distance_km").value(50.0))
    }

    @Test
    fun `POST mileage stores EUR FX snapshot using UTC start date`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")
        val start = "2026-06-01T00:30:00+03:00"
        val end = "2026-06-01T02:00:00+03:00"

        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-05-31"))
            .thenReturn(BigDecimal("0.1964636542"))

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$start","end_time":"$end"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.amount_original").value(20.36))
            .andExpect(jsonPath("$.currency_original").value("EUR"))
            .andExpect(jsonPath("$.fx_rate").value(1.0))
            .andExpect(jsonPath("$.amount_eur").value(20.36))

        verify(fxService).getRate("RON", "2026-05-31")
    }

    @Test
    fun `GET and unrelated mileage update retain stored FX snapshot without resolving`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-01"))
            .thenReturn(BigDecimal.ONE)
        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val mileageId = com.jayway.jsonpath.JsonPath.read<Int>(createRes.response.contentAsString, "$.id")
        clearInvocations(fxService)

        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].currency_original").value("EUR"))
            .andExpect(jsonPath("$[0].fx_rate").value(1.0))
        verify(fxService, times(0)).getRate(anyString(), anyString())

        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"New Office","description":"Updated"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.fx_rate").value(1.0))
        verify(fxService, times(0)).getRate(anyString(), anyString())
    }

    @Test
    fun `changing mileage UTC business date resolves a fresh snapshot`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val mileageId = com.jayway.jsonpath.JsonPath.read<Int>(createRes.response.contentAsString, "$.id")
        clearInvocations(fxService)
        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-02"))
            .thenReturn(BigDecimal("0.1964"))

        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"start_time":"2026-06-02T08:00:00Z","end_time":"2026-06-02T09:30:00Z"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.fx_rate").value(1.0))
            .andExpect(jsonPath("$.amount_eur").value(20.36))

        verify(fxService).getRate("RON", "2026-06-02")
    }

    @Test
    fun `POST mileage on non-draft report returns 400`() {
        val report = makeTechReport()
        report.status = "submitted"
        expenseReportRepository.save(report)
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `POST mileage with end_time before start_time returns 422`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"2026-06-01T10:00:00Z","end_time":"2026-06-01T09:00:00Z"}""")
                .cookie(cookie)
        )
            .andExpect(status().isUnprocessableEntity)
    }

    @Test
    fun `PATCH mileage on draft report returns 200`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val json = createRes.response.contentAsString
        val mileageId = com.jayway.jsonpath.JsonPath.read<Int>(json, "$.id")

        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"New Office","distance_km":75.0}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.origin").value("New Office"))
            .andExpect(jsonPath("$.distance_km").value(75.0))
    }

    @Test
    fun `DELETE mileage on draft report returns 204`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val json = createRes.response.contentAsString
        val mileageId = com.jayway.jsonpath.JsonPath.read<Int>(json, "$.id")

        mockMvc.perform(delete("/api/reports/${report.id}/mileage/$mileageId").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `GET mileage on another user report returns 403`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()

        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech2mileage","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                .cookie(modCookie)
        ).andExpect(status().isCreated)

        val tech2Cookie = authHelper.loginAs("tech2mileage", "pass1234")
        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GET mileage without cookie returns 401 Unauthorized`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()

        mockMvc.perform(get("/api/reports/${report.id}/mileage"))
            .andExpect(status().isUnauthorized)
    }
}
