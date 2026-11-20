package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.FuelPriceHealthStatusOut
import eu.nt.xpenses.services.fuel.FuelPriceHealthService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/fuel-prices")
class FuelPriceController(
    private val fuelPriceHealthService: FuelPriceHealthService,
) {
    @GetMapping("/status")
    fun status(): ResponseEntity<FuelPriceHealthStatusOut> =
        ResponseEntity.ok(fuelPriceHealthService.getHealthStatus())
}
