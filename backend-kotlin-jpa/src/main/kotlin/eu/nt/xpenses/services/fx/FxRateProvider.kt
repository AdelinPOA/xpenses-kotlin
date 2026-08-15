package eu.nt.xpenses.services.fx

import com.fasterxml.jackson.databind.ObjectMapper
import org.slf4j.LoggerFactory
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.http.HttpClient
import java.time.Duration
import java.time.LocalDate
import javax.xml.parsers.DocumentBuilderFactory

enum class FxRateSource {
    BNR,
    ECB_FRANKFURTER,
    CURRENCY_API
}

data class ProviderRate(
    val rateToEur: BigDecimal,
    val sourceDate: LocalDate,
    val source: FxRateSource
)

interface FxRateProvider {
    fun resolve(currency: String, requestedDate: LocalDate): ProviderRate?
}

@Component
class HttpFxRateProvider(
    private val objectMapper: ObjectMapper
) : FxRateProvider {
    private val log = LoggerFactory.getLogger(javaClass)
    private val restClient = RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build()
        ).also { it.setReadTimeout(Duration.ofSeconds(10)) })
        .build()

    override fun resolve(currency: String, requestedDate: LocalDate): ProviderRate? {
        val normalized = currency.uppercase().trim()
        return try {
            BnrRateProvider.fetch(restClient, normalized, requestedDate)
                ?: fetchFrankfurter(normalized, requestedDate)
                ?: fetchCurrencyApi(normalized, requestedDate)
        } catch (exception: Exception) {
            log.warn("Unable to resolve dated FX rate for {} on {}: {}", normalized, requestedDate, exception.message)
            null
        }
    }

    private fun fetchFrankfurter(currency: String, requestedDate: LocalDate): ProviderRate? {
        return try {
            val response = restClient.get()
                .uri("https://api.frankfurter.dev/v2/rate/$currency/EUR?date=$requestedDate&providers=ECB")
                .retrieve()
                .body(String::class.java)
                ?: return null

            val payload = objectMapper.readTree(response)
            val sourceDate = payload["date"]?.asText()?.let(LocalDate::parse) ?: return null
            val rate = payload["rate"]?.asText()?.let { BigDecimal(it) }
                ?: payload["rates"]?.get("EUR")?.asText()?.let { BigDecimal(it) }
                ?: return null
            require(sourceDate <= requestedDate) { "Provider returned a future FX source date" }
            require(rate.signum() > 0) { "Provider returned a non-positive FX rate" }
            ProviderRate(rate, sourceDate, FxRateSource.ECB_FRANKFURTER)
        } catch (e: Exception) {
            log.debug("Frankfurter FX lookup failed for {} on {}: {}", currency, requestedDate, e.message)
            null
        }
    }

    private fun fetchCurrencyApi(currency: String, requestedDate: LocalDate): ProviderRate? {
        val curLower = currency.lowercase().trim()
        val encodedCurLower = java.net.URLEncoder.encode(curLower, "UTF-8")

        val urls = listOf(
            "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@$requestedDate/v1/currencies/$encodedCurLower.min.json",
            "https://latest.currency-api.pages.dev/v1/currencies/$encodedCurLower.min.json"
        )

        for (url in urls) {
            try {
                val response = restClient.get()
                    .uri(url)
                    .retrieve()
                    .body(String::class.java)
                    ?: continue

                val result = CurrencyApiRateProvider.parse(response, curLower, requestedDate)
                if (result != null) {
                    return result
                }
            } catch (e: Exception) {
                log.debug("Currency API attempt failed at {}: {}", url, e.message)
            }
        }
        return null
    }
}

internal object BnrRateProvider {
    fun fetch(restClient: RestClient, currency: String, requestedDate: LocalDate): ProviderRate? {
        val currentYear = fetchYear(restClient, requestedDate.year)
        return currentYear?.let { parse(it, currency, requestedDate) }
            ?: fetchYear(restClient, requestedDate.year - 1)?.let { parse(it, currency, requestedDate) }
    }

    private fun fetchYear(restClient: RestClient, year: Int): String? =
        restClient.get()
            .uri("https://www.bnr.ro/files/xml/years/nbrfxrates$year.xml")
            .retrieve()
            .body(String::class.java)

    fun parse(xml: String, currency: String, requestedDate: LocalDate): ProviderRate? {
        val factory = DocumentBuilderFactory.newInstance().apply {
            isNamespaceAware = true
            setFeature("http://apache.org/xml/features/disallow-doctype-decl", true)
            setFeature("http://xml.org/sax/features/external-general-entities", false)
            setFeature("http://xml.org/sax/features/external-parameter-entities", false)
            setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false)
        }
        val document = factory.newDocumentBuilder().parse(xml.byteInputStream())
        val cubes = document.getElementsByTagNameNS("*", "Cube")
        var selectedDate: LocalDate? = null
        var selectedCube: org.w3c.dom.Element? = null

        for (index in 0 until cubes.length) {
            val cube = cubes.item(index) as? org.w3c.dom.Element ?: continue
            val date = cube.getAttribute("date").takeIf { it.isNotBlank() }?.let(LocalDate::parse) ?: continue
            if (date <= requestedDate && (selectedDate == null || date > selectedDate)) {
                selectedDate = date
                selectedCube = cube
            }
        }

        val cube = selectedCube ?: return null
        val normalized = currency.uppercase().trim()
        val eurRate = rateInRon(cube, "EUR") ?: return null
        val sourceRate = when (normalized) {
            "RON" -> BigDecimal.ONE.divide(eurRate, 12, RoundingMode.HALF_UP)
            "EUR" -> BigDecimal.ONE
            else -> {
                val rate = rateInRon(cube, normalized) ?: return null
                rate.divide(eurRate, 12, RoundingMode.HALF_UP)
            }
        }
        require(sourceRate.signum() > 0) { "BNR returned a non-positive FX rate" }
        return ProviderRate(sourceRate, selectedDate!!, FxRateSource.BNR)
    }

    private fun rateInRon(cube: org.w3c.dom.Element, currency: String): BigDecimal? {
        val rates = cube.getElementsByTagNameNS("*", "Rate")
        for (index in 0 until rates.length) {
            val rate = rates.item(index) as? org.w3c.dom.Element ?: continue
            if (rate.getAttribute("currency").uppercase() != currency) continue
            val multiplier = rate.getAttribute("multiplier")
                .takeIf { it.isNotBlank() }
                ?.toBigDecimal() ?: BigDecimal.ONE
            return rate.textContent.trim().toBigDecimal().divide(multiplier, 12, RoundingMode.HALF_UP)
        }
        return null
    }
}

internal object CurrencyApiRateProvider {
    private val mapper = ObjectMapper()

    fun parse(json: String, currency: String, requestedDate: LocalDate): ProviderRate? {
        val curLower = currency.lowercase().trim()
        val payload = try {
            mapper.readTree(json)
        } catch (_: Exception) {
            return null
        } ?: return null

        val dateText = payload["date"]?.asText()
        val sourceDate = dateText?.takeIf { it.isNotBlank() }?.let {
            try {
                LocalDate.parse(it)
            } catch (_: Exception) {
                null
            }
        } ?: requestedDate

        val rates = payload[curLower] ?: return null
        val eurRateText = rates.get("eur")?.asText() ?: return null
        val rate = try {
            BigDecimal(eurRateText)
        } catch (_: Exception) {
            null
        } ?: return null

        if (rate.signum() <= 0) return null
        return ProviderRate(rate, sourceDate, FxRateSource.CURRENCY_API)
    }
}

