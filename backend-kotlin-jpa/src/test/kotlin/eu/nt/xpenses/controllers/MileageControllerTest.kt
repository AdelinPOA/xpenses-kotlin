package eu.nt.xpenses.controllers

import com.jayway.jsonpath.JsonPath
import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.hamcrest.Matchers.nullValue
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
            .andExpect(status().isUnprocessableContent)
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

    @Test
    fun `POST mileage with vehicle uses vehicle consumption and stores snapshot`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        // 1 RON = 0.2 EUR -> 5.0 RON/EUR; distance 100km, fuel price 9.20 RON/L
        // 6.0 L/100km -> fuel_cost_eur = 6.0 * 9.20 / 5.0 = 11.04 (vs default 7.5 -> 13.80)
        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-01"))
            .thenReturn(BigDecimal("0.2"))

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-99-TST","make_model":"Skoda Octavia","fuel_type":"diesel","fuel_consumption_l_per_100km":6.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":100.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.vehicle_id").value(vehicleId))
            .andExpect(jsonPath("$.vehicle_plate").value("B-99-TST"))
            .andExpect(jsonPath("$.vehicle_make_model").value("Skoda Octavia"))
            .andExpect(jsonPath("$.vehicle_fuel_type").value("diesel"))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(6.0))
            .andExpect(jsonPath("$.fuel_cost_eur").value(11.04))
    }

    @Test
    fun `POST mileage with vehicle lacking consumption falls back to global 7_5`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-01"))
            .thenReturn(BigDecimal("0.2"))

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-55-DEF","make_model":"Dacia Logan","fuel_type":"petrol","fuel_consumption_l_per_100km":null}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":100.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.vehicle_id").value(vehicleId))
            .andExpect(jsonPath("$.vehicle_plate").value("B-55-DEF"))
            .andExpect(jsonPath("$.vehicle_make_model").value("Dacia Logan"))
            .andExpect(jsonPath("$.vehicle_fuel_type").value("petrol"))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(7.5))
            .andExpect(jsonPath("$.fuel_cost_eur").value(13.80))
    }

    @Test
    fun `POST mileage with another user's vehicle returns 404`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        val managerVehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-88-MGR","make_model":"BMW 320d","fuel_type":"diesel","fuel_consumption_l_per_100km":5.8}""")
                .cookie(managerCookie)
        ).andExpect(status().isCreated).andReturn()
        val managerVehicleId = JsonPath.read<Int>(managerVehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$managerVehicleId}""")
                .cookie(techCookie)
        )
            .andExpect(status().isNotFound)
    }

    @Test
    fun `PATCH mileage switching vehicle and clearing vehicle recalculates consumption and updates snapshot`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-01"))
            .thenReturn(BigDecimal("0.2"))

        val vehicleARes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-11-AAA","make_model":"VW Polo","fuel_type":"diesel","fuel_consumption_l_per_100km":6.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleAId = JsonPath.read<Int>(vehicleARes.response.contentAsString, "$.id")

        val vehicleBRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-22-BBB","make_model":"Ford Ranger","fuel_type":"petrol","fuel_consumption_l_per_100km":9.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleBId = JsonPath.read<Int>(vehicleBRes.response.contentAsString, "$.id")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":100.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleAId}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(6.0))
            .andExpect(jsonPath("$.fuel_cost_eur").value(11.04))
            .andReturn()
        val mileageId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        // Switch to vehicle B (9.0 L/100km -> fuel_cost_eur = 9.0 * 9.20 / 5.0 = 16.56)
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"vehicle_id":$vehicleBId}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.vehicle_id").value(vehicleBId))
            .andExpect(jsonPath("$.vehicle_plate").value("B-22-BBB"))
            .andExpect(jsonPath("$.vehicle_make_model").value("Ford Ranger"))
            .andExpect(jsonPath("$.vehicle_fuel_type").value("petrol"))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(9.0))
            .andExpect(jsonPath("$.fuel_cost_eur").value(16.56))

        // Clear vehicle -> reverts to global 7.5 L/100km (fuel_cost_eur = 13.80)
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"clear_vehicle":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.vehicle_id").value(nullValue()))
            .andExpect(jsonPath("$.vehicle_plate").value(nullValue()))
            .andExpect(jsonPath("$.vehicle_make_model").value(nullValue()))
            .andExpect(jsonPath("$.vehicle_fuel_type").value(nullValue()))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(7.5))
            .andExpect(jsonPath("$.fuel_cost_eur").value(13.80))
    }

    @Test
    fun `Editing or deleting vehicle preserves snapshot on existing mileage records`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-77-OLD","make_model":"Renault Megane","fuel_type":"diesel","fuel_consumption_l_per_100km":6.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":100.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        // Edit vehicle plate and consumption
        mockMvc.perform(
            patch("/api/users/me/vehicles/$vehicleId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-77-NEW","fuel_consumption_l_per_100km":10.0}""")
                .cookie(cookie)
        ).andExpect(status().isOk)

        // Separate persistence context boundary before DELETE (matching separate HTTP requests in production)
        entityManager.flush()
        entityManager.clear()

        // Delete vehicle (ON DELETE SET NULL on mileage_records.vehicle_id)
        mockMvc.perform(
            delete("/api/users/me/vehicles/$vehicleId")
                .cookie(cookie)
        ).andExpect(status().isNoContent)

        // Clear L1 cache so subsequent GETs read fresh rows from PostgreSQL
        entityManager.flush()
        entityManager.clear()

        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].vehicle_id").value(nullValue()))
            .andExpect(jsonPath("$[0].vehicle_plate").value("B-77-OLD"))
            .andExpect(jsonPath("$[0].vehicle_make_model").value("Renault Megane"))
            .andExpect(jsonPath("$[0].vehicle_fuel_type").value("diesel"))
            .andExpect(jsonPath("$[0].fuel_consumption_l_per_100km").value(6.0))

        mockMvc.perform(get("/api/reports/${report.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.mileage_records[0].vehicle_id").value(nullValue()))
            .andExpect(jsonPath("$.mileage_records[0].vehicle_plate").value("B-77-OLD"))
            .andExpect(jsonPath("$.mileage_records[0].vehicle_make_model").value("Renault Megane"))
            .andExpect(jsonPath("$.mileage_records[0].vehicle_fuel_type").value("diesel"))
            .andExpect(jsonPath("$.mileage_records[0].fuel_consumption_l_per_100km").value(6.0))
    }
}
