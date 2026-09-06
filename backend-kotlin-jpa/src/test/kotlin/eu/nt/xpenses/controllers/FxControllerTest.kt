package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase

import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import java.math.BigDecimal

class FxControllerTest : IntegrationTestBase() {

    @Test
    fun `quote returns effective rate including margin`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        given(fxService.getRate("USD", "2026-06-01")).willReturn(BigDecimal("0.925000"))

        mockMvc.perform(
            get("/api/fx/quote?from=USD&date=2026-06-01")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.from_currency").value("USD"))
            .andExpect(jsonPath("$.date").value("2026-06-01"))
            .andExpect(jsonPath("$.rate").value(0.925))
    }

    @Test
    fun `quote normalizes currency casing`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        given(fxService.getRate("uah", "2026-06-01")).willReturn(BigDecimal("0.022500"))

        mockMvc.perform(
            get("/api/fx/quote?from=uah&date=2026-06-01")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.from_currency").value("UAH"))
    }

    @Test
    fun `unresolvable rate returns 400 with detail`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        given(fxService.getRate("XXX", "2026-06-01"))
            .willThrow(IllegalArgumentException("Unable to resolve historical FX rate for XXX on 2026-06-01"))

        mockMvc.perform(
            get("/api/fx/quote?from=XXX&date=2026-06-01")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
            .andExpect(jsonPath("$.detail").value("Unable to resolve historical FX rate for XXX on 2026-06-01"))
    }

    @Test
    fun `quote without authentication is rejected`() {
        mockMvc.perform(get("/api/fx/quote?from=USD&date=2026-06-01"))
            .andExpect(status().isUnauthorized)
    }
}
