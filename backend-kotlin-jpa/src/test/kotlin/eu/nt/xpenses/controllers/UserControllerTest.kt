package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class UserControllerTest : IntegrationTestBase() {

    @Test
    fun `GET users as mod returns list without password_hash`() {
        val cookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(get("/api/users").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$[0].password_hash").doesNotExist())
            .andExpect(jsonPath("$[0].username").isString)
            .andExpect(jsonPath("$[0].display_name").isString)
            .andExpect(jsonPath("$[0].role").isString)
            .andExpect(jsonPath("$[0].is_active").isBoolean)
    }

    @Test
    fun `GET users as technician returns 403`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/users").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GET users without cookie returns 401 Unauthorized`() {
        mockMvc.perform(get("/api/users"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET user by id returns UserResponse shape without password_hash`() {
        val user = userRepository.findByUsername("tech1")!!
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(get("/api/users/${user.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.id").value(user.id))
            .andExpect(jsonPath("$.username").value("tech1"))
            .andExpect(jsonPath("$.display_name").isString)
            .andExpect(jsonPath("$.role").value("technician"))
            .andExpect(jsonPath("$.is_active").isBoolean)
            .andExpect(jsonPath("$.auth_source").value("local"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `GET own profile as technician returns 200`() {
        val user = userRepository.findByUsername("tech1")!!
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/users/${user.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.username").value("tech1"))
    }

    @Test
    fun `GET other user profile as technician returns 403`() {
        val manager = userRepository.findByUsername("manager1")!!
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/users/${manager.id}").cookie(cookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `POST users as mod creates new user`() {
        val cookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"newuser","display_name":"New User","password":"pass1234","role":"technician"}""")
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.username").value("newuser"))
            .andExpect(jsonPath("$.password_hash").doesNotExist())
    }

    @Test
    fun `POST users as technician returns 403`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"x","display_name":"X","password":"pass1234","role":"technician"}""")
                .cookie(cookie)
        ).andExpect(status().isForbidden)
    }

    @Test
    fun `POST users with duplicate username returns 409`() {
        val cookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            post("/api/users")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"username":"tech1","display_name":"Dup","password":"pass1234","role":"technician"}""")
                .cookie(cookie)
        )
            .andExpect(status().`is`(409))
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `PATCH me with language ro updates language`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"language":"ro"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.language").value("ro"))
    }

    @Test
    fun `PATCH me with invalid language returns 400`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"language":"xx"}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").isString)
    }

    @Test
    fun `PATCH me without language leaves existing value unchanged`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/users/me")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"display_name":"Updated Name"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.language").value("en"))
    }

    @Test
    fun `GET me returns language field`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/auth/me").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.language").isString)
    }
}
