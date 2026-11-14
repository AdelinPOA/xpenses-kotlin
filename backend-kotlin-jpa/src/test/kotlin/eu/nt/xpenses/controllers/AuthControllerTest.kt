package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class AuthControllerTest : IntegrationTestBase() {

    @Test
    fun `login with valid credentials returns 200 and access_token cookie`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":"tech1"}""")
        )
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(jsonPath("$.username").value("tech1"))
            .andExpect(jsonPath("$.role").value("technician"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `login with case-insensitive username and whitespace returns 200`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"  Tech1  ","password":"tech1"}""")
        )
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(jsonPath("$.username").value("tech1"))
    }

    @Test
    fun `login with email returns 200`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"ION.POPESCU@nt-automation.eu","password":"tech1"}""")
        )
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(jsonPath("$.username").value("tech1"))
    }

    @Test
    fun `login with wrong password returns 401`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":"wrongpassword"}""")
        ).andExpect(status().isUnauthorized)
    }

    @Test
    fun `login with unknown username returns 401`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"nobody","password":"x"}""")
        ).andExpect(status().isUnauthorized)
    }

    @Test
    fun `login with blank username returns 400 with detail`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"","password":"tech1"}""")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `login with blank password returns 400 with detail`() {
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":""}""")
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `GET me without cookie returns 401 Unauthorized`() {
        mockMvc.perform(get("/api/auth/me"))
            .andExpect(status().isUnauthorized)
            .andExpect(jsonPath("$.detail").value("Unauthorized"))
    }

    @Test
    fun `GET me with valid cookie returns current user without password_hash`() {
        val cookie = authHelper.loginAs("manager1", "manager1")
        mockMvc.perform(get("/api/auth/me").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.username").value("manager1"))
            .andExpect(jsonPath("$.role").value("manager"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `logging in on a second device preserves the first device refresh token`() {
        val login1 =
            mockMvc.perform(
                post("/api/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"username":"tech1","password":"tech1"}""")
            )
                .andExpect(status().isOk)
                .andReturn()
        val refreshCookie1 = login1.response.getCookie("refresh_token")!!

        // Second login for same user should not revoke first device's session.
        mockMvc.perform(
            post("/api/auth/login")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","password":"tech1"}""")
        ).andExpect(status().isOk)

        mockMvc.perform(post("/api/auth/refresh").cookie(refreshCookie1))
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(cookie().exists("refresh_token"))
    }

    @Test
    fun `concurrent refresh replay within grace window succeeds without invalidating session`() {
        val login =
            mockMvc.perform(
                post("/api/auth/login")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"username":"tech1","password":"tech1"}""")
            )
                .andExpect(status().isOk)
                .andReturn()
        val originalRefreshCookie = login.response.getCookie("refresh_token")!!

        val firstRefresh =
            mockMvc.perform(post("/api/auth/refresh").cookie(originalRefreshCookie))
                .andExpect(status().isOk)
                .andReturn()
        val newestAccessCookie = firstRefresh.response.getCookie("access_token")!!

        // Duplicate concurrent request still carrying originalRefreshCookie within 30s grace window succeeds.
        mockMvc.perform(post("/api/auth/refresh").cookie(originalRefreshCookie))
            .andExpect(status().isOk)
            .andExpect(cookie().exists("access_token"))
            .andExpect(cookie().exists("refresh_token"))

        // And the user's tokenVersion was not bumped, so newestAccessCookie still authenticates /me.
        mockMvc.perform(get("/api/auth/me").cookie(newestAccessCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.username").value("tech1"))
    }
}
