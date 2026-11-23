package eu.nt.xpenses.controllers

import com.jayway.jsonpath.JsonPath
import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import jakarta.persistence.EntityManager
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.hamcrest.Matchers.containsString
import org.hamcrest.Matchers.endsWith
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.time.Instant

class MileageControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager

    private val startTime = Instant.parse("2026-06-01T08:00:00Z")
    private val endTime = Instant.parse("2026-06-01T09:30:00Z")
    private val mileageBody =
        """{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","description":"Site visit"}"""

    private fun makeTechReport(title: String = "Mileage HTTP Report", status: String = "draft"): ExpenseReport {
        val tech = userRepository.findByUsername("tech1")!!
        return expenseReportRepository.save(ExpenseReport(user = tech, title = title, status = status))
    }

    @Test
    fun `GET mileage enforces auth and access and returns array`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()

        mockMvc.perform(get("/api/reports/${report.id}/mileage"))
            .andExpect(status().isUnauthorized)

        val techCookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(techCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)

        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech2mileagehttp","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                .cookie(modCookie)
        ).andExpect(status().isCreated)

        val tech2Cookie = authHelper.loginAs("tech2mileagehttp", "pass1234")
        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `POST PATCH DELETE mileage return snake_case DTOs, 422 on bad times, and expose via report GET`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$endTime","end_time":"$startTime"}""")
                .cookie(cookie)
        ).andExpect(status().isUnprocessableContent)

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").isNumber)
            .andExpect(jsonPath("$.report_id").value(report.id!!))
            .andExpect(jsonPath("$.origin").value("Office"))
            .andExpect(jsonPath("$.destination").value("Client"))
            .andExpect(jsonPath("$.distance_km").value(50.0))
            .andExpect(jsonPath("$.currency_original").value("EUR"))
            .andExpect(jsonPath("$.round_trip").value(false))
            .andReturn()
        val mileageId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"New Office","distance_km":75.0,"round_trip":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.origin").value("New Office"))
            .andExpect(jsonPath("$.distance_km").value(75.0))
            .andExpect(jsonPath("$.round_trip").value(true))

        entityManager.flush()
        entityManager.clear()
        mockMvc.perform(get("/api/reports/${report.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.mileage_records[0].id").value(mileageId))
            .andExpect(jsonPath("$.mileage_records[0].origin").value("New Office"))
            .andExpect(jsonPath("$.mileage_records[0].round_trip").value(true))

        mockMvc.perform(delete("/api/reports/${report.id}/mileage/$mileageId").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `PATCH mileage returns version, enforces 409 conflict, clears description, validates bounds, and ignores unknown properties`() {
        val report = makeTechReport("Mileage Edit Contract Report")
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        val createRes = mockMvc.perform(
            post("/api/reports/${report.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content(mileageBody)
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.version").value(0))
            .andReturn()
        val mileageId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")
        val initialVersion = JsonPath.read<Int>(createRes.response.contentAsString, "$.version")

        // Unknown JSON property is accepted (fail-on-unknown-properties: false) and blank description clears to null
        val patchRes = mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"  Updated Office  ","description":"","version":$initialVersion,"future_client_flag":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.origin").value("Updated Office"))
            .andExpect(jsonPath("$.description").value(nullValue()))
            .andExpect(jsonPath("$.version").value(initialVersion + 1))
            .andReturn()
        val nextVersion = JsonPath.read<Int>(patchRes.response.contentAsString, "$.version")

        // Stale version returns 409 Conflict
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Stale Edit","version":$initialVersion}""")
                .cookie(cookie)
        )
            .andExpect(status().isConflict)
            .andExpect(jsonPath("$.detail").isString)

        // Blank origin -> 400
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"   ","version":$nextVersion}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        // Contradictory clear_vehicle + vehicle_id -> 400
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"vehicle_id":1,"clear_vehicle":true,"version":$nextVersion}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        // Out-of-range distance_km -> 400
        mockMvc.perform(
            patch("/api/reports/${report.id}/mileage/$mileageId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"distance_km":100001.0,"version":$nextVersion}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        // GET list also exposes incremented version
        mockMvc.perform(get("/api/reports/${report.id}/mileage").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].version").value(nextVersion))
    }

    @Test
    fun `GET trip-sheet returns XLSX attachment for owner and enforces empty 400 and access 403`() {
        val report = makeTechReport()
        entityManager.flush()
        entityManager.clear()
        val techCookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(techCookie))
            .andExpect(status().isBadRequest)

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
            .andExpect(header().string("Content-Disposition", containsString("foaie_parcurs_raport_${report.id}_")))
            .andExpect(header().string("Content-Disposition", endsWith(".xlsx\"")))
            .andReturn()

        XSSFWorkbook(ByteArrayInputStream(ownerRes.response.contentAsByteArray)).use { wb ->
            assertEquals(1, wb.numberOfSheets)
            assertEquals("Iunie", wb.getSheetAt(0).sheetName)
        }

        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech2sheets","display_name":"Tech 2","password":"pass1234","role":"technician"}""")
                .cookie(modCookie)
        ).andExpect(status().isCreated)

        val tech2Cookie = authHelper.loginAs("tech2sheets", "pass1234")
        mockMvc.perform(get("/api/reports/${report.id}/mileage/trip-sheet").cookie(tech2Cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `PATCH report starting_odometer_km and POST submit wire odometer validation and advancement`() {
        val tech = userRepository.findByUsername("tech1")!!
        val draftReport = makeTechReport(title = "Odometer Submit Report")
        expenseRepository.save(
            Expense(
                user = tech,
                report = draftReport,
                amountOriginal = BigDecimal("25.00"),
                amountEur = BigDecimal("25.00"),
                date = "2026-06-01",
            )
        )
        val submittedReport = makeTechReport(title = "Already Submitted", status = "submitted")
        entityManager.flush()
        entityManager.clear()

        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        // Validation & access checks on starting_odometer_km
        mockMvc.perform(
            patch("/api/reports/${draftReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":-5.0}""")
                .cookie(techCookie)
        ).andExpect(status().isBadRequest)

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

        // Set, clear, and re-set starting_odometer_km
        mockMvc.perform(
            patch("/api/reports/${draftReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":375000.5}""")
                .cookie(techCookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.starting_odometer_km").value(375000.5))

        mockMvc.perform(
            patch("/api/reports/${draftReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"clear_starting_odometer":true}""")
                .cookie(techCookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.starting_odometer_km").value(nullValue()))

        val vehicleRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B-700-ODO","make_model":"Dacia Duster","fuel_type":"diesel"}""")
                .cookie(techCookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(vehicleRes.response.contentAsString, "$.id")

        mockMvc.perform(
            patch("/api/reports/${draftReport.id}")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"starting_odometer_km":375000.0}""")
                .cookie(techCookie)
        ).andExpect(status().isOk)

        mockMvc.perform(
            post("/api/reports/${draftReport.id}/mileage")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"origin":"Office","destination":"Client","distance_km":50.0,"start_time":"$startTime","end_time":"$endTime","vehicle_id":$vehicleId}""")
                .cookie(techCookie)
        ).andExpect(status().isCreated)

        mockMvc.perform(
            post("/api/reports/${draftReport.id}/submit")
                .contentType(MediaType.APPLICATION_JSON)
                .cookie(techCookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.status").value("submitted"))

        mockMvc.perform(get("/api/users/me/vehicles").cookie(techCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(vehicleId))
            .andExpect(jsonPath("$[0].last_odometer_km").value(375050.0))
    }
}
