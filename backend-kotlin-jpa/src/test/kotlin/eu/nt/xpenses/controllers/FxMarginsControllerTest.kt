package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.repositories.AppSettingRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class FxMarginsControllerTest : IntegrationTestBase() {
    @Autowired
    private lateinit var appSettingRepository: AppSettingRepository

    @Test
    fun `D-02 mixed invalid margins returns all errors without partial persistence`() {
        val before = appSettingRepository.findById("fx_margins").orElseThrow().value
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"margins":{" usd ":3.0,"EUR":-1.0,"RON":1.0},"default_margin":101.0}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").value("Invalid FX margins"))
            .andExpect(jsonPath("$.errors['margins.EUR']").exists())
            .andExpect(jsonPath("$.errors['margins.RON']").exists())
            .andExpect(jsonPath("$.errors.defaultMargin").exists())

        assertEquals(before, appSettingRepository.findById("fx_margins").orElseThrow().value)
    }

    @Test
    fun `D-02 valid patch normalizes keys and stores decimal fractions`() {
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"margins":{" usd ":3.0,"RON":0.0},"default_margin":2.5}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.margins.USD").value(3.0))
            .andExpect(jsonPath("$.margins.RON").value(0.0))
            .andExpect(jsonPath("$.default_margin").value(2.5))

        val stored = appSettingRepository.findById("fx_margins").orElseThrow().value
        org.junit.jupiter.api.Assertions.assertTrue(stored.contains("\"USD\":0.03"))
        org.junit.jupiter.api.Assertions.assertTrue(stored.contains("\"*\":0.025"))
    }

    @Test
    fun `D-02 rejects normalized duplicate keys and nonzero RON`() {
        val before = appSettingRepository.findById("fx_margins").orElseThrow().value
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"margins":{"usd":2.0,"USD":3.0,"RON":1.0}}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.errors['margins.USD']").exists())
            .andExpect(jsonPath("$.errors['margins.RON']").exists())

        assertEquals(before, appSettingRepository.findById("fx_margins").orElseThrow().value)
    }

    @Test
    fun `D-02 accepts zero and one hundred but rejects malformed keys`() {
        val cookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"margins":{"JPY":0.0,"CAD":100.0}}""")
                .cookie(cookie)
        ).andExpect(status().isOk)

        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"margins":{"US":2.0,"USD/EUR":2.0}}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.errors['margins.US']").exists())
            .andExpect(jsonPath("$.errors['margins.USD/EUR']").exists())
    }

    @Test
    fun `D-02 empty patch is a no-op and technician remains forbidden`() {
        val before = appSettingRepository.findById("fx_margins").orElseThrow().value
        val cfo = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("{}")
                .cookie(cfo)
        ).andExpect(status().isOk)
        assertEquals(before, appSettingRepository.findById("fx_margins").orElseThrow().value)

        val technician = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/settings/fx-margins")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"default_margin":3.0}""")
                .cookie(technician)
        ).andExpect(status().isForbidden)
    }
}
