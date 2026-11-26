package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.MileageRatesOut
import eu.nt.xpenses.dto.settings.MileageRatesUpdate
import eu.nt.xpenses.mileage.MileageRatesService
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings/mileage-rates")
class MileageRatesController(
    private val mileageRatesService: MileageRatesService,
) {
    @GetMapping
    fun readMileageRates(): ResponseEntity<MileageRatesOut> =
        ResponseEntity.ok(mileageRatesService.getMileageRates())

    @PatchMapping
    @PreAuthorize("hasRole('chef_finance')")
    fun updateMileageRates(
        @Valid @RequestBody body: MileageRatesUpdate,
    ): ResponseEntity<MileageRatesOut> =
        ResponseEntity.ok(mileageRatesService.updateMileageRates(body))
}
