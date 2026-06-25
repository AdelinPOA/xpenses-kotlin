package eu.nt.xpenses.services

import eu.nt.xpenses.models.FxRate
import eu.nt.xpenses.repositories.FxRateRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import java.net.URLEncoder
import java.time.Instant

@Service
class FxService(
    private val fxRateRepository: FxRateRepository
) {
    private val log = LoggerFactory.getLogger(FxService::class.java)
    private val restClient = RestClient.builder().build()

    fun getRate(fromCurrency: String, date: String): Double {
        val currency = fromCurrency.uppercase().trim()
        if (currency == "EUR") {
            return 1.0
        }

        // Check cache
        val cached = fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(currency, "EUR", date)
        if (cached != null) {
            return cached.rate
        }

        // Fetch from external APIs
        var rate = fetchFrankfurter(currency, date)
        if (rate == null) {
            rate = fetchFallback(currency, date)
        }

        if (rate == null || rate == 0.0) {
            throw IllegalArgumentException("Invalid rate returned for $currency: $rate")
        }

        // Save in cache
        try {
            val fxRate = FxRate(
                fromCurrency = currency,
                toCurrency = "EUR",
                rateDate = date,
                rate = rate,
                fetchedAt = Instant.now()
            )
            fxRateRepository.save(fxRate)
        } catch (e: Exception) {
            log.warn("Failed to save FX rate: {}", e.message, e)
            val existing = fxRateRepository.findByFromCurrencyAndToCurrencyAndRateDate(currency, "EUR", date)
            if (existing != null) {
                return existing.rate
            }
        }

        return rate
    }

    private fun fetchFrankfurter(currency: String, date: String): Double? {
        return try {
            val encodedCurrency = URLEncoder.encode(currency, "UTF-8")
            val url = "https://api.frankfurter.dev/v1/$date?from=$encodedCurrency&to=EUR"
            val response = restClient.get()
                .uri(url)
                .retrieve()
                .body<Map<String, Any>>()
            
            val rates = response?.get("rates") as? Map<*, *>
            val eurRate = rates?.get("EUR")
            (eurRate as? Number)?.toDouble()
        } catch (e: Exception) {
            null
        }
    }

    private fun fetchFallback(currency: String, date: String): Double? {
        val curLower = currency.lowercase()
        val encodedCurLower = URLEncoder.encode(curLower, "UTF-8")
        return try {
            val url = "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@$date/v1/currencies/$encodedCurLower.min.json"
            var response: Map<String, Any>? = null
            try {
                response = restClient.get()
                    .uri(url)
                    .retrieve()
                    .body<Map<String, Any>>()
            } catch (e: Exception) {
                // Try latest fallback
                val latestUrl = "https://latest.currency-api.pages.dev/v1/currencies/$encodedCurLower.min.json"
                response = restClient.get()
                    .uri(latestUrl)
                    .retrieve()
                    .body<Map<String, Any>>()
            }

            val rates = response?.get(curLower) as? Map<*, *>
            val eurRate = rates?.get("eur")
            (eurRate as? Number)?.toDouble()
        } catch (e: Exception) {
            null
        }
    }
}
