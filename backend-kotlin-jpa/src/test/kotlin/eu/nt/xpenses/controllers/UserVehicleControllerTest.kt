package eu.nt.xpenses.controllers

import com.jayway.jsonpath.JsonPath
import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class UserVehicleControllerTest : IntegrationTestBase() {

    @Test
    fun `unauthenticated request returns 401 with detail`() {
        mockMvc.perform(get("/api/users/me/vehicles"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.detail").value("Unauthorized"))
    }

    @Test
    fun `CRUD vehicle endpoints return expected HTTP statuses and snake_case JSON`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        val createRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"plate_number":" b 123 xyz ","make_model":"Dacia Duster","fuel_type":"diesel","fuel_consumption_l_per_100km":6.5,"last_odometer_km":375000.5}"""
                )
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").isNumber)
            .andExpect(jsonPath("$.plate_number").value("B 123 XYZ"))
            .andExpect(jsonPath("$.make_model").value("Dacia Duster"))
            .andExpect(jsonPath("$.fuel_type").value("diesel"))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(6.5))
            .andExpect(jsonPath("$.vehicle_category").value("M1"))
            .andExpect(jsonPath("$.last_odometer_km").value(375000.5))
            .andExpect(jsonPath("$.is_default").value(true))
            .andExpect(jsonPath("$.created_at").isNotEmpty)
            .andExpect(jsonPath("$.updated_at").isNotEmpty)
            .andReturn()
        val vehicleId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(vehicleId))

        mockMvc.perform(
            patch("/api/users/me/vehicles/$vehicleId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"make_model":"Dacia Jogger","vehicle_category":"n1"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.make_model").value("Dacia Jogger"))
            .andExpect(jsonPath("$.vehicle_category").value("N1"))

        mockMvc.perform(delete("/api/users/me/vehicles/$vehicleId").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `ValidationExceptionHandler maps vehicle validation and missing vehicle errors to detail JSON`() {
        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B 123 ABC","fuel_type":"nuclear"}""")
                .cookie(techCookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isNotEmpty)

        val createRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B 999 ZZZ"}""")
                .cookie(techCookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        mockMvc.perform(
            patch("/api/users/me/vehicles/$vehicleId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"make_model":"Hijacked"}""")
                .cookie(managerCookie)
        )
            .andExpect(status().isNotFound)
            .andExpect(jsonPath("$.detail").value("Vehicle not found"))
    }
}
