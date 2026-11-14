package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.FxRate
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.FxRateRepository
import eu.nt.xpenses.services.fx.FxRateProvider
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.stereotype.Service
import org.springframework.transaction.PlatformTransactionManager
import org.springframework.transaction.TransactionDefinition
import org.springframework.transaction.support.TransactionTemplate
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate

@Service
class FxService @Autowired constructor(
    private val fxRateRepository: FxRateRepository,
    private val appSettingRepository: AppSettingRepository,
    private val objectMapper: ObjectMapper,
    private val fxRateProvider: FxRateProvider,
    private val transactionManager: PlatformTransactionManager? = null,
) {
    constructor(
        fxRateRepository: FxRateRepository,
        appSettingRepository: AppSettingRepository,
        objectMapper: ObjectMapper,
        fxRateProvider: FxRateProvider,
    ) : this(fxRateRepository, appSettingRepository, objectMapper, fxRateProvider, null)
    private val defaultMargins = mapOf(
        "EUR" to BigDecimal("0.02"),
        "USD" to BigDecimal("0.025"),
        "GBP" to BigDecimal("0.02"),
        "CHF" to BigDecimal("0.02"),
        "*" to BigDecimal("0.02")
    )

    fun getRate(fromCurrency: String, date: String): BigDecimal {
        val currency = fromCurrency.uppercase().trim()
        if (currency == "EUR") return BigDecimal.ONE

        val cached = fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(currency, "EUR", date)
        if (cached != null) return cached.rate

        val requestedDate = LocalDate.parse(date)
        val providerRate = fxRateProvider.resolve(currency, requestedDate)
            ?: throw IllegalArgumentException("Unable to resolve historical FX rate for $currency on $date")
        val margin = if (currency == "RON") BigDecimal.ZERO else getMargin(currency)
        val rate = providerRate.rateToEur
            .multiply(BigDecimal.ONE.add(margin))
            .setScale(6, RoundingMode.HALF_UP)
        require(rate.signum() > 0) { "Invalid rate returned for $currency: $rate" }

        val candidate = FxRate(
            fromCurrency = currency,
            toCurrency = "EUR",
            rateDate = date,
            sourceDate = providerRate.sourceDate,
            source = providerRate.source,
            rate = rate,
            fetchedAt = Instant.now()
        )
        persistCachedRate(currency, date, candidate)?.let { return it }

        return rate
    }

    private fun persistCachedRate(currency: String, date: String, candidate: FxRate): BigDecimal? {
        val writeAction = {
            fxRateRepository.save(candidate)
        }
        return try {
            val tm = transactionManager
            if (tm != null) {
                TransactionTemplate(tm).apply {
                    propagationBehavior = TransactionDefinition.PROPAGATION_REQUIRES_NEW
                }.execute {
                    writeAction()
                }
            } else {
                writeAction()
            }
            null
        } catch (exception: DataIntegrityViolationException) {
            fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(currency, "EUR", date)?.rate
                ?: throw exception
        }
    }

    fun convert(amount: BigDecimal, fromCurrency: String, date: String): BigDecimal {
        return amount.multiply(getRate(fromCurrency, date)).setScale(2, RoundingMode.HALF_UP)
    }

    private fun getMargin(currency: String): BigDecimal {
        return try {
            val stored = appSettingRepository.findById("fx_margins").orElse(null)?.value
            val margins = if (stored.isNullOrBlank()) {
                defaultMargins
            } else {
                objectMapper.readValue(stored, Map::class.java).entries.associate { entry ->
                    entry.key.toString().uppercase().trim() to BigDecimal(entry.value.toString())
                }
            }
            margins[currency] ?: margins["*"] ?: defaultMargins.getValue("*")
        } catch (_: Exception) {
            defaultMargins[currency] ?: defaultMargins.getValue("*")
        }
    }
}
