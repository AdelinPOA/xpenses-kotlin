package eu.nt.xpenses.controllers

import com.jayway.jsonpath.JsonPath
import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.FuelPrice
import eu.nt.xpenses.repositories.FuelPriceRepository
import eu.nt.xpenses.services.fuel.FuelPriceSource
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

    @Autowired
    private lateinit var fuelPriceRepository: FuelPriceRepository

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
    fun `PATCH mileage with another user's vehicle returns 404`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(techCookie)
        ).andExpect(status().isCreated).andReturn()
        val mileageId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        val managerVehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-89-MGR","make_model":"Audi A4","fuel_type":"diesel","fuel_consumption_l_per_100km":6.2}""")
                .cookie(managerCookie)
        ).andExpect(status().isCreated).andReturn()
        val managerVehicleId = JsonPath.read<Int>(managerVehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"vehicle_id":$managerVehicleId}""")
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

    @Test
    fun `POST mileage with round_trip true and N1 vehicle persists both without doubling distance_km`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-10-N1","make_model":"Ford Transit","fuel_type":"diesel","vehicle_category":"N1"}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId,"round_trip":true}"""
                )
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.distance_km").value(50.0))
            .andExpect(jsonPath("$.round_trip").value(true))
            .andExpect(jsonPath("$.vehicle_category").value("N1"))
            .andReturn()
        val mileageId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        // Verify ReportMapper also exposes round_trip and vehicle_category
        entityManager.flush()
        entityManager.clear()
        mockMvc.perform(get("/api/reports/${report.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.mileage_records[0].distance_km").value(50.0))
            .andExpect(jsonPath("$.mileage_records[0].round_trip").value(true))
            .andExpect(jsonPath("$.mileage_records[0].vehicle_category").value("N1"))

        // PATCH can toggle round_trip back to false without affecting distance_km
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"round_trip":false}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.distance_km").value(50.0))
            .andExpect(jsonPath("$.round_trip").value(false))
    }

    @Test
    fun `PATCH report sets, validates, and clears starting_odometer_km`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            patch("/api/reports/${report.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":375000.5}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.starting_odometer_km").value(375000.5))

        // Invalid starting_odometer_km values rejected with 400
        mockMvc.perform(
            patch("/api/reports/${report.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":-5.0}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            patch("/api/reports/${report.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":375000.55}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            patch("/api/reports/${report.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"clear_starting_odometer":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.starting_odometer_km").value(nullValue()))
    }

    @Test
    fun `POST report submit advances primary vehicle last_odometer_km monotonically without regressing`() {
        val tech = userRepository.findByUsername("tech1")!!
        val report1 = expenseReportRepository.save(ExpenseReport(user = tech, title = "Trip Report 1"))
        expenseRepository.save(
            Expense(
                user = tech,
                report = report1,
                amountOriginal = BigDecimal("25.00"),
                amountEur = BigDecimal("25.00"),
                date = "2026-06-01"
            )
        )
        val report2 = expenseReportRepository.save(ExpenseReport(user = tech, title = "Trip Report 2"))
        expenseRepository.save(
            Expense(
                user = tech,
                report = report2,
                amountOriginal = BigDecimal("30.00"),
                amountEur = BigDecimal("30.00"),
                date = "2026-06-02"
            )
        )
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-700-ODO","make_model":"Dacia Duster","fuel_type":"diesel"}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        // Report 1: starting_odometer_km = 375000.0 + 50 km trip -> 375050.0
        mockMvc.perform(
            patch("/api/reports/${report1.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":375000.0}""")
                .cookie(cookie)
        ).andExpect(status().isOk)

        mockMvc.perform(
            post("/api/reports/${report1.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        mockMvc.perform(
            post("/api/reports/${report1.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(vehicleId))
            .andExpect(jsonPath("$[0].last_odometer_km").value(375050.0))

        // Report 2: lower starting_odometer_km = 300000.0 + 50 km trip -> must NOT regress 375050.0
        mockMvc.perform(
            patch("/api/reports/${report2.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":300000.0}""")
                .cookie(cookie)
        ).andExpect(status().isOk)

        mockMvc.perform(
            post("/api/reports/${report2.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client 2","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        mockMvc.perform(
            post("/api/reports/${report2.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(vehicleId))
            .andExpect(jsonPath("$[0].last_odometer_km").value(375050.0))
    }

    @Test
    fun `POST report submit with multiple vehicles advances only primary vehicle by its own distance`() {
        val tech = userRepository.findByUsername("tech1")!!
        val report = expenseReportRepository.save(ExpenseReport(user = tech, title = "Multi-Vehicle Trip Report"))
        expenseRepository.save(
            Expense(
                user = tech,
                report = report,
                amountOriginal = BigDecimal("40.00"),
                amountEur = BigDecimal("40.00"),
                date = "2026-06-01"
            )
        )
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val vehicleARes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-100-AAA","make_model":"Skoda Octavia","fuel_type":"diesel","last_odometer_km":100000.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleAId = JsonPath.read<Int>(vehicleARes.response.contentAsString, "$.id")

        val vehicleBRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-200-BBB","make_model":"Dacia Duster","fuel_type":"petrol","last_odometer_km":200000.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleBId = JsonPath.read<Int>(vehicleBRes.response.contentAsString, "$.id")

        mockMvc.perform(
            patch("/api/reports/${report.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":100000.0}""")
                .cookie(cookie)
        ).andExpect(status().isOk)

        // Earliest trip with Vehicle A (100.0 km)
        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client A","distance_km":100.0,"start_time":"2026-06-01T08:00:00Z","end_time":"2026-06-01T09:30:00Z","vehicle_id":$vehicleAId}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        // Later trip with Vehicle B (250.0 km)
        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client B","distance_km":250.0,"start_time":"2026-06-02T08:00:00Z","end_time":"2026-06-02T11:30:00Z","vehicle_id":$vehicleBId}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        mockMvc.perform(
            post("/api/reports/${report.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(vehicleAId))
            .andExpect(jsonPath("$[0].last_odometer_km").value(100100.0))
            .andExpect(jsonPath("$[1].id").value(vehicleBId))
            .andExpect(jsonPath("$[1].last_odometer_km").value(200000.0))
    }

    @Test
    fun `PATCH report starting_odometer_km returns 400 on submitted report and 403 for another user`() {
        val draftReport = makeTechReport()
        val submittedReport = makeTechReport().apply { status = "submitted" }
        expenseReportRepository.save(submittedReport)
        entityManager.flush()
        entityManager.clear()

        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            patch("/api/reports/${submittedReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":123456.0}""")
                .cookie(techCookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            patch("/api/reports/${draftReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":123456.0}""")
                .cookie(managerCookie)
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `GET trip-sheet returns 200 with valid xlsx for owner and manager`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(techCookie)
        ).andExpect(status().isCreated)

        val expectedContentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

        val ownerRes = mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(techCookie))
            .andExpect(status().isOk)
            .andExpect(header().string("Content-Type", expectedContentType))
            .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.containsString("foaie_parcurs_raport_${report.id}_")))
            .andExpect(header().string("Content-Disposition", org.hamcrest.Matchers.endsWith(".xlsx\"")))
            .andReturn()

        org.apache.poi.xssf.usermodel.XSSFWorkbook(java.io.ByteArrayInputStream(ownerRes.response.contentAsByteArray)).use { wb ->
            org.junit.jupiter.api.Assertions.assertEquals(1, wb.numberOfSheets)
            org.junit.jupiter.api.Assertions.assertEquals("Iunie", wb.getSheetAt(0).sheetName)
        }

        mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(managerCookie))
            .andExpect(status().isOk)
            .andExpect(header().string("Content-Type", expectedContentType))
    }

    @Test
    fun `GET trip-sheet returns 400 when report has no mileage records`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(techCookie))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET trip-sheet returns 403 for unrelated technician`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(techCookie)
        ).andExpect(status().isCreated)

        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech2tripsheet","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                .cookie(modCookie)
        ).andExpect(status().isCreated)

        val tech2Cookie = authHelper.loginAs("tech2tripsheet", "pass1234")
        mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `POST mileage picks cached daily fuel price for vehicle fuel type and records fuel_price_source`() {
        val report = makeTechReport()
        fuelPriceRepository.save(
            FuelPrice(
                fuelType = "diesel",
                priceDate = "2026-06-01",
                sourceDate = java.time.LocalDate.parse("2026-06-01"),
                source = FuelPriceSource.PRETCARBURANT_DATA,
                priceRonPerLiter = BigDecimal("10.50"),
                stationCount = 1350,
            ),
        )
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        org.mockito.Mockito.`when`(fxService.getRate("RON", "2026-06-01"))
            .thenReturn(BigDecimal("0.2")) // 5.0 RON/EUR

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-77-DSL","make_model":"VW Passat","fuel_type":"diesel","fuel_consumption_l_per_100km":6.0}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        // 100 km * 6.0 L/100km = 6.0 L * 10.50 RON/L = 63.0 RON / 5.0 = 12.60 EUR
        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":100.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.fuel_price_ron_per_liter").value(10.50))
            .andExpect(jsonPath("$.fuel_price_source").value("PRETCARBURANT_DATA"))
            .andExpect(jsonPath("$.fuel_cost_eur").value(12.60))
    }
}
