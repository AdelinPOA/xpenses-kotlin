package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.FxHealthStatusOut
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.fx.FxProviderHealthService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.format.DateTimeParseException

@RestController
@RequestMapping("/api/fx")
class FxController(
    private val fxService: FxService,
    private val fxProviderHealthService: FxProviderHealthService,
) {

    /**
     * Effective conversion rate for one unit of `from` currency to EUR on `date`,
     * including the configured per-currency FX margin.
     *
     * Used by the expense form to live-preview and derive manual rates from the
     * final debited amount (see CONTEXT.md: "debited amount").
     */
    @GetMapping("/quote")
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

    @GetMapping("/status")
    fun status(): ResponseEntity<FxHealthStatusOut> =
        ResponseEntity.ok(fxProviderHealthService.getHealthStatus())
}
