package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.FxHealthStatusOut
import eu.nt.xpenses.dto.settings.FxMarginsOut
import eu.nt.xpenses.dto.settings.FxMarginsUpdate
import eu.nt.xpenses.dto.settings.FxProvidersOut
import eu.nt.xpenses.dto.settings.FxProvidersUpdate
import eu.nt.xpenses.dto.settings.FxTestRequest
import eu.nt.xpenses.dto.settings.FxTestResponse
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.fx.FxMarginsService
import eu.nt.xpenses.services.fx.FxProviderHealthService
import eu.nt.xpenses.services.fx.FxRateSource
import eu.nt.xpenses.services.fx.HttpFxRateProvider
import jakarta.validation.Valid
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.LocalDate
import java.time.format.DateTimeParseException

@RestController
class FxController(
    private val fxService: FxService,
    private val fxMarginsService: FxMarginsService,
    private val fxProviderHealthService: FxProviderHealthService,
    private val httpFxRateProvider: HttpFxRateProvider,
) {

    /**
     * Effective conversion rate for one unit of `from` currency to EUR on `date`,
     * including the configured per-currency FX margin.
     *
     * Used by the expense form to live-preview and derive manual rates from the
     * final debited amount (see CONTEXT.md: "debited amount").
     */
    @GetMapping("/api/fx/quote")
    fun quote(
        @RequestParam(name = "from") from: String,
        @RequestParam date: String
    ): ResponseEntity<Map<String, Any>> {
        val rate: BigDecimal = try {
            fxService.getRate(from, date)
        } catch (e: Exception) {
            if (e is IllegalArgumentException || e is DateTimeParseException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
            }
            throw e
        }
        return ResponseEntity.ok(
            mapOf(
                "from_currency" to from.uppercase().trim(),
                "date" to date,
                "rate" to rate
            )
        )
    }

    @GetMapping("/api/fx/status")
    fun status(): ResponseEntity<FxHealthStatusOut> =
        ResponseEntity.ok(fxProviderHealthService.getHealthStatus())

    @GetMapping("/api/settings/fx-margins")
    fun readFxMargins(): ResponseEntity<FxMarginsOut> = ResponseEntity.ok(fxMarginsService.getFxMargins())

    @PatchMapping("/api/settings/fx-margins")
    @PreAuthorize("hasRole('chef_finance')")
    fun updateFxMargins(
        @Valid @RequestBody body: FxMarginsUpdate,
    ): ResponseEntity<FxMarginsOut> = ResponseEntity.ok(fxMarginsService.updateFxMargins(body))

    @GetMapping("/api/settings/fx-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun readFxProviders(): ResponseEntity<FxProvidersOut> {
        val current = httpFxRateProvider.getProviderPriority().map { it.name }
        val available = FxRateSource.entries.map { it.name }
        return ResponseEntity.ok(FxProvidersOut(providers = current, availableProviders = available))
    }

    @PatchMapping("/api/settings/fx-providers")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun updateFxProviders(
        @Valid @RequestBody body: FxProvidersUpdate,
    ): ResponseEntity<FxProvidersOut> {
        val parsed =
            body.providers.mapNotNull { name ->
                try {
                    FxRateSource.valueOf(name.uppercase().trim())
                } catch (_: Exception) {
                    null
                }
            }
        if (parsed.isEmpty()) {
            return ResponseEntity.badRequest().build()
        }
        httpFxRateProvider.saveProviderPriority(parsed)
        val updated = httpFxRateProvider.getProviderPriority().map { it.name }
        val available = FxRateSource.entries.map { it.name }
        return ResponseEntity.ok(FxProvidersOut(providers = updated, availableProviders = available))
    }

    @PostMapping("/api/settings/fx-providers/check")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun checkFxProviders(): ResponseEntity<FxHealthStatusOut> =
        ResponseEntity.ok(fxProviderHealthService.runHealthCheck())

    @PostMapping("/api/settings/fx-providers/test")
    @PreAuthorize("hasAnyRole('mod', 'chef_finance')")
    fun testFxProviders(
        @RequestBody body: FxTestRequest,
    ): ResponseEntity<FxTestResponse> {
        val currency = body.currency.trim().uppercase()
        if (currency.isBlank()) {
            return ResponseEntity.ok(FxTestResponse(success = false, message = "Currency code is required"))
        }
        val date =
            body.date?.takeIf { it.isNotBlank() }?.let {
                try {
                    LocalDate.parse(it)
                } catch (_: Exception) {
                    null
                }
            } ?: LocalDate.now()

        val providerRate = httpFxRateProvider.resolve(currency, date)
        return if (providerRate != null) {
            ResponseEntity.ok(
                FxTestResponse(
                    success = true,
                    message = "Successfully resolved $currency to EUR via ${providerRate.source.name}",
                    rate = providerRate.rateToEur,
                    source = providerRate.source.name,
                    sourceDate = providerRate.sourceDate.toString(),
                ),
            )
        } else {
            ResponseEntity.ok(
                FxTestResponse(
                    success = false,
                    message = "Could not resolve rate for $currency on $date from any configured provider",
                ),
            )
        }
    }
}
