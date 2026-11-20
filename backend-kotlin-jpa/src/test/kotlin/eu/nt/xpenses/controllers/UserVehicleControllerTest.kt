package eu.nt.xpenses.controllers

import com.jayway.jsonpath.JsonPath
import eu.nt.xpenses.IntegrationTestBase
import org.hamcrest.Matchers.nullValue
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class UserVehicleControllerTest : IntegrationTestBase() {

    @Test
    fun `POST first vehicle normalizes plate uppercase and auto-sets is_default true`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content(
                    """{"plate_number":" b 123 xyz ","make_model":"Dacia Duster","fuel_type":"diesel","fuel_consumption_l_per_100km":6.5}"""
                )
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.id").isNumber)
            .andExpect(jsonPath("$.plate_number").value("B 123 XYZ"))
            .andExpect(jsonPath("$.make_model").value("Dacia Duster"))
            .andExpect(jsonPath("$.fuel_type").value("diesel"))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(6.5))
            .andExpect(jsonPath("$.is_default").value(true))
            .andExpect(jsonPath("$.created_at").isNotEmpty)
            .andExpect(jsonPath("$.updated_at").isNotEmpty)
    }

    @Test
    fun `POST second vehicle with is_default true clears previous default without constraint error`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        val firstRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 100 aaa","make_model":"Skoda Octavia","fuel_type":"petrol"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.is_default").value(true))
            .andReturn()
        val firstId = JsonPath.read<Int>(firstRes.response.contentAsString, "$.id")

        val secondRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"cj 200 bbb","make_model":"VW Golf","fuel_type":"diesel","is_default":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.is_default").value(true))
            .andReturn()
        val secondId = JsonPath.read<Int>(secondRes.response.contentAsString, "$.id")

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(2))
            .andExpect(jsonPath("$[0].id").value(secondId))
            .andExpect(jsonPath("$[0].is_default").value(true))
            .andExpect(jsonPath("$[1].id").value(firstId))
            .andExpect(jsonPath("$[1].is_default").value(false))
    }

    @Test
    fun `PATCH vehicle updates fields, switches default, and clears optional consumption when requested`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        val firstRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 111 aaa","make_model":"Dacia Logan","fuel_type":"petrol","fuel_consumption_l_per_100km":7.2}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val firstId = JsonPath.read<Int>(firstRes.response.contentAsString, "$.id")

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 222 bbb","make_model":"Ford Focus","fuel_type":"diesel","is_default":true}""")
                .cookie(cookie)
        ).andExpect(status().isCreated)

        mockMvc.perform(
            patch("/api/users/me/vehicles/$firstId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"make_model":"Dacia Jogger","is_default":true,"clear_fuel_consumption":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(firstId))
            .andExpect(jsonPath("$.make_model").value("Dacia Jogger"))
            .andExpect(jsonPath("$.is_default").value(true))
            .andExpect(jsonPath("$.fuel_consumption_l_per_100km").value(nullValue()))

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].id").value(firstId))
            .andExpect(jsonPath("$[0].is_default").value(true))
            .andExpect(jsonPath("$[1].is_default").value(false))
    }

    @Test
    fun `DELETE default vehicle promotes oldest remaining vehicle to default`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        val firstRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 301 aaa","make_model":"Car 1"}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val firstId = JsonPath.read<Int>(firstRes.response.contentAsString, "$.id")

        val secondRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 302 bbb","make_model":"Car 2"}""")
                .cookie(cookie)
        ).andExpect(status().isCreated).andReturn()
        val secondId = JsonPath.read<Int>(secondRes.response.contentAsString, "$.id")

        mockMvc.perform(delete("/api/users/me/vehicles/$firstId").cookie(cookie))
            .andExpect(status().isNoContent)

        mockMvc.perform(get("/api/users/me/vehicles").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(1))
            .andExpect(jsonPath("$[0].id").value(secondId))
            .andExpect(jsonPath("$[0].is_default").value(true))
    }

    @Test
    fun `Validation rejects invalid fuel_type, non-positive or over-50 consumption, and blank plate`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B 123 ABC","fuel_type":"nuclear"}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B 123 ABC","fuel_consumption_l_per_100km":0}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"B 123 ABC","fuel_consumption_l_per_100km":55}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"   "}""")
                .cookie(cookie)
        ).andExpect(status().isBadRequest)
    }

    @Test
    fun `Ownership isolation prevents another user from seeing, patching, or deleting vehicle`() {
        val techCookie = authHelper.loginAs("tech1", "tech1")
        val managerCookie = authHelper.loginAs("manager1", "manager1")

        val createRes = mockMvc.perform(
            post("/api/users/me/vehicles")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"plate_number":"b 999 zzz","make_model":"Tech Car"}""")
                .cookie(techCookie)
        ).andExpect(status().isCreated).andReturn()
        val vehicleId = JsonPath.read<Int>(createRes.response.contentAsString, "$.id")

        mockMvc.perform(get("/api/users/me/vehicles").cookie(managerCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.length()").value(0))

        mockMvc.perform(
            patch("/api/users/me/vehicles/$vehicleId")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"make_model":"Hijacked"}""")
                .cookie(managerCookie)
        ).andExpect(status().isNotFound)

        mockMvc.perform(delete("/api/users/me/vehicles/$vehicleId").cookie(managerCookie))
            .andExpect(status().isNotFound)
    }
}
