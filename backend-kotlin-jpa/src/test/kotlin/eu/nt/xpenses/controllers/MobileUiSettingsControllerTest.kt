package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.repositories.AppSettingRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class MobileUiSettingsControllerTest : IntegrationTestBase() {
    @Autowired
    private lateinit var appSettingRepository: AppSettingRepository

    @Test
    fun `GET defaults to disabled when setting is absent`() {
        appSettingRepository.deleteById("mobile_quick_add_fab_enabled")

        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(get("/api/settings/ui").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.mobile_quick_add_fab_enabled").value(false))
    }

    @Test
    fun `mod can update the mobile Dashboard FAB and value is persisted`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            patch("/api/settings/ui")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"mobile_quick_add_fab_enabled":true}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.mobile_quick_add_fab_enabled").value(true))

        assertEquals("true", appSettingRepository.findById("mobile_quick_add_fab_enabled").orElseThrow().value)
    }

    @Test
    fun `chef finance and technician cannot update the mobile Dashboard FAB`() {
        val cfo = authHelper.loginAs("cfo1", "cfo1")
        val technician = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            patch("/api/settings/ui")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"mobile_quick_add_fab_enabled":true}""")
                .cookie(cfo)
        ).andExpect(status().isForbidden)

        mockMvc.perform(
            patch("/api/settings/ui")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"mobile_quick_add_fab_enabled":true}""")
                .cookie(technician)
        ).andExpect(status().isForbidden)
    }
}
