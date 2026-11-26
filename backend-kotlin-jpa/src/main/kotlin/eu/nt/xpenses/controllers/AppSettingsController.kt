package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.DailyAllowanceOut
import eu.nt.xpenses.dto.settings.DailyAllowanceUpdate
import eu.nt.xpenses.dto.settings.MobileUiConfigOut
import eu.nt.xpenses.dto.settings.MobileUiConfigUpdate
import eu.nt.xpenses.services.AppSettingsService
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings")
class AppSettingsController(
    private val appSettingsService: AppSettingsService,
) {
    @GetMapping("/ui")
    fun readMobileUiConfig(): ResponseEntity<MobileUiConfigOut> =
        ResponseEntity.ok(MobileUiConfigOut(appSettingsService.isMobileQuickAddFabEnabled()))

    @PatchMapping("/ui")
    @PreAuthorize("hasRole('mod')")
    fun updateMobileUiConfig(
        @Valid @RequestBody body: MobileUiConfigUpdate,
    ): ResponseEntity<MobileUiConfigOut> =
        ResponseEntity.ok(MobileUiConfigOut(appSettingsService.updateMobileQuickAddFab(body.mobileQuickAddFabEnabled)))

    @GetMapping("/daily-allowance-rate")
    fun readDailyAllowanceRate(): ResponseEntity<DailyAllowanceOut> =
        ResponseEntity.ok(DailyAllowanceOut(appSettingsService.getDailyAllowanceRate()))

    @PatchMapping("/daily-allowance-rate")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateDailyAllowanceRate(
        @Valid @RequestBody body: DailyAllowanceUpdate,
    ): ResponseEntity<DailyAllowanceOut> =
        try {
            val updated = appSettingsService.updateDailyAllowanceRate(body.dailyAllowanceRate)
            ResponseEntity.ok(DailyAllowanceOut(updated))
        } catch (_: IllegalArgumentException) {
            ResponseEntity.badRequest().build()
        }
}
