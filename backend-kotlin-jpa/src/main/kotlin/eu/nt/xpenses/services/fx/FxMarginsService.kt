package eu.nt.xpenses.services.fx

import eu.nt.xpenses.config.FxMarginsValidationException
import eu.nt.xpenses.dto.settings.FxMarginsOut
import eu.nt.xpenses.dto.settings.FxMarginsUpdate
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.FxRateRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

/**
 * Owns `fx_margins` configuration, validation, and per-currency margin lookup.
 */
@Service
class FxMarginsService(
    private val appSettingRepository: AppSettingRepository,
    private val fxRateRepository: FxRateRepository,
    private val objectMapper: ObjectMapper,
) {
    companion object {
        val DEFAULT_FX_MARGIN: BigDecimal = BigDecimal("0.02")
        private val DEFAULT_FX_CURRENCIES = listOf("EUR", "USD", "GBP", "CHF", "RON")
    }

    fun readMarginsMap(): Map<String, BigDecimal> {
        val stored = appSettingRepository.findById("fx_margins").orElse(null)?.value ?: return emptyMap()
        return try {
            objectMapper.readValue(stored, Map::class.java).entries.associate { entry ->
                entry.key
                    .toString()
                    .uppercase()
                    .trim() to BigDecimal(entry.value.toString())
            }
        } catch (_: Exception) {
            emptyMap()
        }
    }

    fun getMargin(currency: String): BigDecimal {
        val margins = readMarginsMap()
        return margins[currency] ?: margins["*"] ?: DEFAULT_FX_MARGIN
    }

    fun getFxMargins(): FxMarginsOut = toFxMarginsOut(readMarginsMap())

    @Transactional
    fun updateFxMargins(body: FxMarginsUpdate): FxMarginsOut {
        val current = readMarginsMap()
        val errors = linkedMapOf<String, String>()
        val normalized = linkedMapOf<String, BigDecimal>()
        val originalKeys = mutableMapOf<String, String>()

        body.margins.orEmpty().forEach { (rawKey, percentage) ->
            val key = rawKey.trim().uppercase()
            val field = "margins.$rawKey"
            val validKey = key == "*" || key.matches(Regex("^[A-Z]{3}$"))
            if (!validKey) {
                errors[field] = "Currency must be a three-letter ISO code or *"
            } else if (originalKeys.putIfAbsent(key, rawKey) != null) {
                errors[field] = "Currency key duplicates another key after normalization"
            }

            if (percentage < BigDecimal.ZERO || percentage > BigDecimal(100)) {
                errors[field] = "Margin must be between 0 and 100 percent"
            }
            if (key == "RON" && percentage.compareTo(BigDecimal.ZERO) != 0) {
                errors[field] = "RON cannot have a conversion margin"
            }
            if (validKey && !normalized.containsKey(key)) {
                normalized[key] = percentage
            }
        }

        body.defaultMargin?.let { percentage ->
            if (percentage < BigDecimal.ZERO || percentage > BigDecimal(100)) {
                errors["defaultMargin"] = "Margin must be between 0 and 100 percent"
            } else if (normalized.containsKey("*")) {
                errors["defaultMargin"] = "Use either margins.* or defaultMargin, not both"
            } else {
                normalized["*"] = percentage
            }
        }

        if (errors.isNotEmpty()) {
            throw FxMarginsValidationException(errors)
        }

        val candidate = current.toMutableMap()
        normalized.forEach { (key, percentage) -> candidate[key] = percentage.movePointLeft(2) }
        if (normalized.isNotEmpty()) {
            appSettingRepository.save(AppSetting("fx_margins", objectMapper.writeValueAsString(candidate), Instant.now()))
            fxRateRepository.deleteAllInBatch()
        }
        return toFxMarginsOut(candidate)
    }

    private fun toFxMarginsOut(parsed: Map<String, BigDecimal>): FxMarginsOut {
        val defaultFraction = parsed["*"] ?: DEFAULT_FX_MARGIN
        val currencies = (DEFAULT_FX_CURRENCIES + parsed.keys.filter { it != "*" }).distinct()
        val margins =
            currencies.associateWith { currency ->
                when (currency) {
                    "RON" -> BigDecimal.ZERO
                    else -> (parsed[currency] ?: defaultFraction).movePointRight(2).setScale(2, RoundingMode.HALF_UP)
                }
            }
        return FxMarginsOut(
            margins = margins,
            defaultMargin = defaultFraction.movePointRight(2).setScale(2, RoundingMode.HALF_UP),
            currencies = currencies,
        )
    }
}
