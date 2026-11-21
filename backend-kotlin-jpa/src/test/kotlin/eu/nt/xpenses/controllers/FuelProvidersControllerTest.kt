package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.services.fuel.FuelPriceSource
import eu.nt.xpenses.services.fuel.HttpFuelPriceProvider
import org.hamcrest.Matchers.contains
import org.hamcrest.Matchers.hasSize
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status

class FuelProvidersControllerTest : IntegrationTestBase() {
    @Autowired
    private lateinit var httpFuelPriceProvider: HttpFuelPriceProvider

    @Test
    fun `GET fuel-providers succeeds for mod and chef_finance and returns 403 for technician`() {
        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(get("/api/settings/fuel-providers").cookie(modCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.providers", hasSize<Any>(3)))
            .andExpect(
                jsonPath(
                    "$.available_providers",
                    contains(
                        "PRETCARBURANT_LIVE",
                        "PRETCARBURANT_DATA",
                        "EU_WEEKLY_OIL_BULLETIN",
                    ),
                ),
            )

        val cfoCookie = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(get("/api/settings/fuel-providers").cookie(cfoCookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.providers", hasSize<Any>(3)))

        val techCookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(get("/api/settings/fuel-providers").cookie(techCookie))
            .andExpect(status().isForbidden)
    }

    @Test
    fun `PATCH fuel-providers succeeds for mod and chef_finance, saves priority, and returns 403 for technician`() {
        val modCookie = authHelper.loginAs("mod1", "mod1")
        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":["EU_WEEKLY_OIL_BULLETIN","PRETCARBURANT_DATA","PRETCARBURANT_LIVE"]}""")
                .cookie(modCookie),
        )
            .andExpect(status().isOk)
            .andExpect(
                jsonPath(
                    "$.providers",
                    contains(
                        "EU_WEEKLY_OIL_BULLETIN",
                        "PRETCARBURANT_DATA",
                        "PRETCARBURANT_LIVE",
                    ),
                ),
            )
            .andExpect(jsonPath("$.available_providers", hasSize<Any>(3)))

        assertEquals(
            listOf(
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
                FuelPriceSource.PRETCARBURANT_DATA,
                FuelPriceSource.PRETCARBURANT_LIVE,
            ),
            httpFuelPriceProvider.getProviderPriority(),
        )

        val cfoCookie = authHelper.loginAs("cfo1", "cfo1")
        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":["PRETCARBURANT_DATA"]}""")
                .cookie(cfoCookie),
        )
            .andExpect(status().isOk)
            .andExpect(
                jsonPath(
                    "$.providers",
                    contains(
                        "PRETCARBURANT_DATA",
                        "PRETCARBURANT_LIVE",
                        "EU_WEEKLY_OIL_BULLETIN",
                    ),
                ),
            )

        assertEquals(
            listOf(
                FuelPriceSource.PRETCARBURANT_DATA,
                FuelPriceSource.PRETCARBURANT_LIVE,
                FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
            ),
            httpFuelPriceProvider.getProviderPriority(),
        )

        val techCookie = authHelper.loginAs("tech1", "tech1")
        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":["PRETCARBURANT_LIVE"]}""")
                .cookie(techCookie),
        )
            .andExpect(status().isForbidden)
    }

    @Test
    fun `PATCH fuel-providers rejects MANUAL_SETTING, invalid, and empty provider lists with 400`() {
        val cfoCookie = authHelper.loginAs("cfo1", "cfo1")

        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":["MANUAL_SETTING"]}""")
                .cookie(cfoCookie),
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":["INVALID"]}""")
                .cookie(cfoCookie),
        ).andExpect(status().isBadRequest)

        mockMvc.perform(
            patch("/api/settings/fuel-providers")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"providers":[]}""")
                .cookie(cfoCookie),
        ).andExpect(status().isBadRequest)
    }
}
