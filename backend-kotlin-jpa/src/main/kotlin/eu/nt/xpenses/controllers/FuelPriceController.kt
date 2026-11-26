package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.FuelPriceHealthStatusOut
import eu.nt.xpenses.dto.settings.FuelProvidersOut
import eu.nt.xpenses.dto.settings.FuelProvidersUpdate
import eu.nt.xpenses.services.fuel.FuelPriceHealthService
import eu.nt.xpenses.services.fuel.FuelPriceSource
import eu.nt.xpenses.services.fuel.HttpFuelPriceProvider
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RestController

@RestController
class FuelPriceController(
    private val fuelPriceHealthService: FuelPriceHealthService,
    private val httpFuelPriceProvider: HttpFuelPriceProvider,
) {
    @GetMapping("/api/fuel-prices/status")
    fun status(): ResponseEntity<FuelPriceHealthStatusOut> =
        ResponseEntity.ok(fuelPriceHealthService.getHealthStatus())

    @GetMapping("/api/settings/fuel-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun readFuelProviders(): ResponseEntity<FuelProvidersOut> =
        ResponseEntity.ok(buildFuelProvidersOut())

    @PatchMapping("/api/settings/fuel-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun updateFuelProviders(
        @Valid @RequestBody body: FuelProvidersUpdate,
    ): ResponseEntity<FuelProvidersOut> {
        val parsed =
            body.providers.map { name ->
                val source =
                    try {
                        FuelPriceSource.valueOf(name.uppercase().trim())
                    } catch (_: Exception) {
                        return ResponseEntity.badRequest().build()
                    }
                if (source !in HttpFuelPriceProvider.EXTERNAL_SOURCES) {
                    return ResponseEntity.badRequest().build()
                }
                source
            }
        if (parsed.isEmpty()) {
            return ResponseEntity.badRequest().build()
        }
        httpFuelPriceProvider.saveProviderPriority(parsed)
        return ResponseEntity.ok(buildFuelProvidersOut())
    }

    @PostMapping("/api/settings/fuel-prices/check")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun checkFuelPrices(): ResponseEntity<FuelPriceHealthStatusOut> =
        ResponseEntity.ok(fuelPriceHealthService.runHealthCheck())

    private fun buildFuelProvidersOut(): FuelProvidersOut =
        FuelProvidersOut(
            providers = httpFuelPriceProvider.getProviderPriority().map { it.name },
            availableProviders = HttpFuelPriceProvider.EXTERNAL_SOURCES.map { it.name },
        )
}
