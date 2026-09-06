package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class CategoryControllerTest : IntegrationTestBase() {

    @Test
    fun `GET active categories returns 200`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/categories").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
            .andExpect(jsonPath("$[0].name").isString)
    }

    @Test
    fun `POST category as mod returns 201`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            post("/api/categories")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Travel","limit_amount":2000.00}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.name").value("Travel"))
            .andExpect(jsonPath("$.is_active").value(true))
    }

    @Test
    fun `POST duplicate category name returns 409`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            post("/api/categories")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Transport"}""")
                .cookie(cookie)
        )
            .andExpect(status().isConflict)
    }

    @Test
    fun `POST category as technician returns 403`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            post("/api/categories")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Travel","limit_amount":2000.00}""")
                .cookie(cookie)
        )
            .andExpect(status().isForbidden)
    }

    @Test
    fun `PATCH category as mod returns 200`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            patch("/api/categories/1")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"name":"Meals & Food Updated","limit_amount":250.00}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.name").value("Meals & Food Updated"))
            .andExpect(jsonPath("$.limit_amount").value(250.00))
    }

    @Test
    fun `DELETE category as mod returns 204 (deactivates)`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(delete("/api/categories/1").cookie(cookie))
            .andExpect(status().isNoContent)

        mockMvc.perform(get("/api/categories?active_only=false").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[?(@.id == 1)].is_active").value(false))
    }

    @Test
    fun `DELETE non-existent category returns 404`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(delete("/api/categories/9999").cookie(cookie))
            .andExpect(status().isNotFound)
    }

    @Test
    fun `GET categories without cookie returns 401 Unauthorized`() {
        mockMvc.perform(get("/api/categories"))
            .andExpect(status().isUnauthorized)
    }
}
