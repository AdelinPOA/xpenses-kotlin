package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.context.TestPropertySource
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

@TestPropertySource(properties = ["spring.task.scheduling.enabled=false"])
class ImapIngestionRecoveryControllerTest : IntegrationTestBase() {

    @Test
    fun `mod can list ingestion recovery`() {
        val cookie = authHelper.loginAs("mod1", "mod1")

        mockMvc.perform(
            get("/api/settings/imap/ingestion")
                .cookie(cookie)
                .accept(MediaType.APPLICATION_JSON)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$", hasSize<Any>(0)))
    }

    @Test
    fun `technician cannot list ingestion recovery`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            get("/api/settings/imap/ingestion")
                .cookie(cookie)
                .accept(MediaType.APPLICATION_JSON)
        ).andExpect(status().isForbidden)
    }
}
