package eu.nt.xpenses.controllers

import eu.nt.xpenses.services.FxService
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal

@RestController
@RequestMapping("/api/fx")
class FxController(
    private val fxService: FxService
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
        } catch (e: IllegalArgumentException) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
        }
        return ResponseEntity.ok(
            mapOf(
                "from_currency" to from.uppercase().trim(),
                "date" to date,
                "rate" to rate
            )
        )
    }
}
