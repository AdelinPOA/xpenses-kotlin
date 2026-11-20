package eu.nt.xpenses.services.fx

import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import eu.nt.xpenses.repositories.AppSettingRepository
import org.slf4j.LoggerFactory
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.HttpClientErrorException
import org.springframework.web.client.RestClient
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.http.HttpClient
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZoneOffset
import java.util.concurrent.ConcurrentHashMap
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

data class ProviderHealthState(
    val provider: FxRateSource,
    val healthy: Boolean,
    val checkedAt: Instant,
    val sourceDate: LocalDate? = null,
    val ronPerEur: BigDecimal? = null,
    val latencyMs: Long? = null,
    val error: String? = null,
)

interface FxRateProvider {
    fun resolve(currency: String, requestedDate: LocalDate): ProviderRate?
}

@Component
class HttpFxRateProvider(
    private val objectMapper: ObjectMapper,
    private val appSettingRepository: AppSettingRepository
) : FxRateProvider {
    private val log = LoggerFactory.getLogger(javaClass)
    private val providerStates = ConcurrentHashMap<FxRateSource, ProviderHealthState>()
    private val restClient = RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build()
        ).also { it.setReadTimeout(Duration.ofSeconds(10)) })
        .build()

    fun getProviderPriority(): List<FxRateSource> {
        val stored = appSettingRepository.findById("fx_provider_priority").orElse(null)?.value
        if (!stored.isNullOrBlank()) {
            try {
                val list: List<String> = objectMapper.readValue(stored)
                val parsed = list.mapNotNull { name ->
                    try { FxRateSource.valueOf(name.uppercase().trim()) } catch (_: Exception) { null }
                }.distinct()
                if (parsed.isNotEmpty()) {
                    val missing = FxRateSource.entries.filter { it !in parsed }
                    return parsed + missing
                }
            } catch (_: Exception) {}
        }
        return listOf(FxRateSource.BNR, FxRateSource.ECB_FRANKFURTER, FxRateSource.CURRENCY_API)
    }

    fun saveProviderPriority(priority: List<FxRateSource>) {
        val valid = priority.distinct()
        val allIncluded = valid + FxRateSource.entries.filter { it !in valid }
        val names = allIncluded.map { it.name }
        val setting = eu.nt.xpenses.model.AppSetting(
            key = "fx_provider_priority",
            value = objectMapper.writeValueAsString(names),
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)
    }

    fun getProviderStates(): Map<FxRateSource, ProviderHealthState> = providerStates.toMap()

    /**
     * Probe one provider directly for health/fallback tracking without triggering downstream fallbacks.
     */
    fun probeProvider(
        source: FxRateSource,
        currency: String = "RON",
        requestedDate: LocalDate = LocalDate.now(ZoneId.of("Europe/Bucharest")),
    ): ProviderHealthState {
        val normalized = currency.uppercase().trim()
        val startedNanos = System.nanoTime()
        return try {
            val rate = fetchFromSource(source, normalized, requestedDate)
            val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
            if (rate != null) {
                recordSuccess(source, normalized, rate, elapsedMs)
            } else {
                val msg = "No $normalized/EUR rate returned"
                log.warn("FX probe failed for {} ({} on {}): {}", source, normalized, requestedDate, msg)
                recordFailure(source, msg, elapsedMs)
            }
        } catch (e: Exception) {
            val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
            val summary = summarizeError(e)
            log.warn("FX probe failed for {} ({} on {}): {}", source, normalized, requestedDate, summary)
            recordFailure(source, summary, elapsedMs)
        }
    }

    override fun resolve(currency: String, requestedDate: LocalDate): ProviderRate? {
        val normalized = currency.uppercase().trim()
        val priority = getProviderPriority()
        for (source in priority) {
            val startedNanos = System.nanoTime()
            try {
                val rate = fetchFromSource(source, normalized, requestedDate)
                val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
                if (rate != null) {
                    recordSuccess(source, normalized, rate, elapsedMs)
                    return rate
                }
                if (normalized == "RON") {
                    val msg = "No RON/EUR rate returned"
                    log.warn("FX provider {} returned no rate for RON on {}", source, requestedDate)
                    recordFailure(source, msg, elapsedMs)
                }
            } catch (e: Exception) {
                val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
                val summary = summarizeError(e)
                log.warn("FX provider {} failed for {} on {}: {}", source, normalized, requestedDate, summary)
                recordFailure(source, summary, elapsedMs)
            }
        }
        log.warn("Unable to resolve dated FX rate for {} on {} across providers {}", normalized, requestedDate, priority)
        return null
    }

    private fun fetchFromSource(
        source: FxRateSource,
        normalizedCurrency: String,
        requestedDate: LocalDate,
    ): ProviderRate? = when (source) {
        FxRateSource.BNR -> BnrRateProvider.fetch(restClient, normalizedCurrency, requestedDate)
        FxRateSource.ECB_FRANKFURTER -> fetchFrankfurter(normalizedCurrency, requestedDate)
        FxRateSource.CURRENCY_API -> fetchCurrencyApi(normalizedCurrency, requestedDate)
    }

    private fun recordSuccess(
        source: FxRateSource,
        normalizedCurrency: String,
        rate: ProviderRate,
        elapsedMs: Long,
    ): ProviderHealthState {
        val ronPerEur =
            if (normalizedCurrency == "RON") computeRonPerEur(rate.rateToEur)
            else providerStates[source]?.ronPerEur
        val state = ProviderHealthState(
            provider = source,
            healthy = true,
            checkedAt = Instant.now(),
            sourceDate = rate.sourceDate,
            ronPerEur = ronPerEur,
            latencyMs = elapsedMs,
            error = null,
        )
        providerStates[source] = state
        return state
    }

    private fun recordFailure(
        source: FxRateSource,
        error: String,
        elapsedMs: Long,
    ): ProviderHealthState {
        val state = ProviderHealthState(
            provider = source,
            healthy = false,
            checkedAt = Instant.now(),
            sourceDate = null,
            ronPerEur = null,
            latencyMs = elapsedMs,
            error = error,
        )
        providerStates[source] = state
        return state
    }

    private fun computeRonPerEur(rateToEur: BigDecimal): BigDecimal =
        BigDecimal.ONE.divide(rateToEur, 4, RoundingMode.HALF_UP)

    private fun summarizeError(e: Throwable): String {
        val raw = (e.message ?: e.javaClass.simpleName).replace(Regex("\\s+"), " ").trim()
        return if (raw.length > 160) raw.take(157) + "..." else raw.ifBlank { e.javaClass.simpleName }
    }

    private fun fetchFrankfurter(currency: String, requestedDate: LocalDate): ProviderRate? {
        val entity = try {
            restClient.get()
                .uri("https://api.frankfurter.dev/v2/rate/$currency/EUR?date=$requestedDate&providers=ECB")
                .retrieve()
                .toEntity(String::class.java)
        } catch (e: HttpClientErrorException.NotFound) {
            if (currency != "RON") return null
            throw e
        }

        if (!entity.statusCode.is2xxSuccessful) {
            throw IllegalStateException("HTTP ${entity.statusCode.value()} from Frankfurter")
        }

        val response = entity.body ?: throw IllegalStateException("Empty response from Frankfurter")
        val payload = objectMapper.readTree(response)
        val sourceDate = payload["date"]?.asString()?.let(LocalDate::parse)
            ?: throw IllegalStateException("Missing date in Frankfurter response")
        val rate = payload["rate"]?.asString()?.let { BigDecimal(it) }
            ?: payload["rates"]?.get("EUR")?.asString()?.let { BigDecimal(it) }
            ?: return null
        require(sourceDate <= requestedDate) { "Provider returned a future FX source date" }
        require(rate.signum() > 0) { "Provider returned a non-positive FX rate" }
        return ProviderRate(rate, sourceDate, FxRateSource.ECB_FRANKFURTER)
    }

    private fun fetchCurrencyApi(currency: String, requestedDate: LocalDate): ProviderRate? {
        val curLower = currency.lowercase().trim()
        val encodedCurLower = java.net.URLEncoder.encode(curLower, "UTF-8")

        val urls = buildList {
            add("https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@$requestedDate/v1/currencies/$encodedCurLower.min.json")
            add("https://$requestedDate.currency-api.pages.dev/v1/currencies/$encodedCurLower.min.json")
            if (requestedDate >= LocalDate.now(ZoneOffset.UTC).minusDays(1)) {
                add("https://latest.currency-api.pages.dev/v1/currencies/$encodedCurLower.min.json")
            }
        }

        var lastFailure: Exception? = null
        for (url in urls) {
            try {
                val entity = restClient.get()
                    .uri(url)
                    .retrieve()
                    .toEntity(String::class.java)
                if (!entity.statusCode.is2xxSuccessful) {
                    lastFailure = IllegalStateException("HTTP ${entity.statusCode.value()} from Currency API")
                    continue
                }
                val response = entity.body
                if (response.isNullOrBlank()) {
                    lastFailure = IllegalStateException("Empty response from Currency API")
                    continue
                }

                val result = CurrencyApiRateProvider.parse(response, curLower, requestedDate)
                if (result != null) {
                    return result
                }
            } catch (e: HttpClientErrorException.NotFound) {
                if (currency == "RON") {
                    lastFailure = e
                }
            } catch (e: Exception) {
                lastFailure = e
                log.debug("Currency API attempt failed at {}: {}", url, e.message)
            }
        }
        if (lastFailure != null) {
            throw lastFailure
        }
        return null
    }
}

internal object BnrRateProvider {
    const val BASE_URL = "https://curs.bnr.ro/files/xml/years"

    fun fetch(restClient: RestClient, currency: String, requestedDate: LocalDate): ProviderRate? {
        val currentYearXml = try {
            fetchYear(restClient, requestedDate.year)
        } catch (e: Exception) {
            // Jan 1-5 may precede the new year's first BNR publication, so fall back to prior year only then.
            if (requestedDate.dayOfYear <= 5) {
                return parse(fetchYear(restClient, requestedDate.year - 1), currency, requestedDate)
            }
            throw e
        }

        return parse(currentYearXml, currency, requestedDate)
            ?: if (requestedDate.dayOfYear <= 5) {
                parse(fetchYear(restClient, requestedDate.year - 1), currency, requestedDate)
            } else {
                null
            }
    }

    private fun fetchYear(restClient: RestClient, year: Int): String {
        val entity = restClient.get()
            .uri("$BASE_URL/nbrfxrates$year.xml")
            .retrieve()
            .toEntity(String::class.java)
        if (!entity.statusCode.is2xxSuccessful) {
            val location = entity.headers.location?.toString()
            val locationSuffix = if (!location.isNullOrBlank()) " -> $location" else ""
            throw IllegalStateException("HTTP ${entity.statusCode.value()}$locationSuffix")
        }
        val body = entity.body
        if (body.isNullOrBlank() || !body.contains("<Cube")) {
            throw IllegalStateException("Unexpected non-XML response from curs.bnr.ro")
        }
        return body
    }

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

        val dateText = payload["date"]?.asString()
        val sourceDate = dateText?.takeIf { it.isNotBlank() }?.let {
            try {
                LocalDate.parse(it)
            } catch (_: Exception) {
                null
            }
        } ?: requestedDate
        require(sourceDate <= requestedDate) { "Provider returned a future FX source date" }

        val rates = payload[curLower] ?: return null
        val eurRateText = rates.get("eur")?.asString() ?: return null
        val rate = try {
            BigDecimal(eurRateText)
        } catch (_: Exception) {
            null
        } ?: return null

        if (rate.signum() <= 0) return null
        return ProviderRate(rate, sourceDate, FxRateSource.CURRENCY_API)
    }
}
