package eu.nt.xpenses.services.fuel

import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.FxService
import org.apache.poi.ss.usermodel.Cell
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.DateUtil
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.slf4j.LoggerFactory
import org.springframework.http.client.JdkClientHttpRequestFactory
import org.springframework.stereotype.Component
import org.springframework.web.client.RestClient
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.module.kotlin.readValue
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.net.http.HttpClient
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.ChronoUnit
import java.util.concurrent.ConcurrentHashMap

enum class FuelPriceSource {
    PRETCARBURANT_LIVE,
    PRETCARBURANT_DATA,
    EU_WEEKLY_OIL_BULLETIN,
    MANUAL_SETTING,
}

data class ProviderFuelPrice(
    val priceRonPerLiter: BigDecimal,
    val sourceDate: LocalDate,
    val source: FuelPriceSource,
    val stationCount: Int? = null,
)

data class FuelProviderHealthState(
    val provider: FuelPriceSource,
    val healthy: Boolean,
    val checkedAt: Instant,
    val sourceDate: LocalDate? = null,
    val dieselRon: BigDecimal? = null,
    val petrolRon: BigDecimal? = null,
    val lpgRon: BigDecimal? = null,
    val latencyMs: Long? = null,
    val error: String? = null,
)

interface FuelPriceProvider {
    fun resolve(canonicalFuelType: String, requestedDate: LocalDate): ProviderFuelPrice?
}

internal object FuelJsonHelper {
    fun readBigDecimal(node: JsonNode?): BigDecimal? {
        if (node == null || node.isNull || node.isMissingNode) return null
        return try {
            if (node.isNumber) node.decimalValue()
            else node.asString().trim().takeIf { it.isNotEmpty() }?.toBigDecimal()
        } catch (_: Exception) {
            null
        }
    }

    fun readInt(node: JsonNode?): Int? {
        if (node == null || node.isNull || node.isMissingNode) return null
        return try {
            if (node.isNumber) node.intValue()
            else node.asString().trim().toIntOrNull()
        } catch (_: Exception) {
            null
        }
    }
}

internal object PretCarburantLiveParser {
    const val LIVE_URL = "https://pretcarburant.ro/api/v1/preturi"
    private const val MAX_STALE_DAYS = 14L

    fun parse(
        json: String,
        objectMapper: ObjectMapper,
        requestedDate: LocalDate,
    ): Map<String, ProviderFuelPrice> {
        val root = objectMapper.readTree(json)
            ?: throw IllegalStateException("Empty JSON from pretcarburant.ro")
        val dateText = root["data"]?.asString()?.trim()
            ?: throw IllegalStateException("Missing date field in pretcarburant.ro response")
        val sourceDate = LocalDate.parse(dateText)
        if (sourceDate.isAfter(requestedDate)) return emptyMap()
        if (ChronoUnit.DAYS.between(sourceDate, requestedDate) > MAX_STALE_DAYS) return emptyMap()

        val networks = root["retele"]
        if (networks == null || !networks.isArray) {
            throw IllegalStateException("Missing retele array in pretcarburant.ro response")
        }

        val fieldMapping = mapOf(
            "motorina" to "diesel",
            "benzina" to "petrol",
            "gpl" to "lpg",
        )
        val buckets = mutableMapOf<String, MutableList<BigDecimal>>()

        for (entry in networks) {
            for ((jsonKey, canonicalType) in fieldMapping) {
                val price = FuelJsonHelper.readBigDecimal(entry[jsonKey]) ?: continue
                if (price > BigDecimal.ZERO) {
                    buckets.getOrPut(canonicalType) { mutableListOf() }.add(price)
                }
            }
        }

        val result = mutableMapOf<String, ProviderFuelPrice>()
        for ((canonicalType, prices) in buckets) {
            if (prices.isEmpty()) continue
            val sum = prices.fold(BigDecimal.ZERO) { acc, value -> acc.add(value) }
            val avg = sum.divide(BigDecimal.valueOf(prices.size.toLong()), 2, RoundingMode.HALF_UP)
            result[canonicalType] = ProviderFuelPrice(
                priceRonPerLiter = avg,
                sourceDate = sourceDate,
                source = FuelPriceSource.PRETCARBURANT_LIVE,
                stationCount = prices.size,
            )
        }
        return result
    }
}

internal object PretCarburantDataParser {
    const val DATA_URL =
        "https://raw.githubusercontent.com/An3treiu/pretcarburant-data/main/monthly/cumulative-latest.json"
    private const val MAX_STALE_DAYS = 14L

    private val fuelTypeMap = mapOf(
        "motorina_standard" to "diesel",
        "benzina_standard" to "petrol",
        "gpl" to "lpg",
    )

    fun parse(
        json: String,
        objectMapper: ObjectMapper,
        requestedDate: LocalDate,
    ): Map<String, ProviderFuelPrice> {
        val root = objectMapper.readTree(json)
        if (root == null || !root.isArray) {
            throw IllegalStateException("Expected JSON array from pretcarburant-data")
        }

        val bestByType = mutableMapOf<String, ProviderFuelPrice>()

        for (entry in root) {
            val rawFuelType = entry["fuel_type"]?.asString()?.trim()?.lowercase() ?: continue
            val canonicalType = fuelTypeMap[rawFuelType] ?: continue
            val rowDateText = entry["date"]?.asString()?.trim() ?: continue
            val rowDate = try {
                LocalDate.parse(rowDateText)
            } catch (_: Exception) {
                continue
            }
            if (rowDate.isAfter(requestedDate)) continue
            if (ChronoUnit.DAYS.between(rowDate, requestedDate) > MAX_STALE_DAYS) continue

            val avgPrice = FuelJsonHelper.readBigDecimal(entry["price_avg"]) ?: continue
            if (avgPrice <= BigDecimal.ZERO) continue
            val roundedPrice = avgPrice.setScale(2, RoundingMode.HALF_UP)
            val stations = FuelJsonHelper.readInt(entry["station_count"])

            val currentBest = bestByType[canonicalType]
            if (currentBest == null || rowDate.isAfter(currentBest.sourceDate)) {
                bestByType[canonicalType] = ProviderFuelPrice(
                    priceRonPerLiter = roundedPrice,
                    sourceDate = rowDate,
                    source = FuelPriceSource.PRETCARBURANT_DATA,
                    stationCount = stations,
                )
            }
        }
        return bestByType
    }
}

internal object EuWeeklyOilBulletinParser {
    const val LATEST_XLSX_URL =
        "https://energy.ec.europa.eu/document/download/264c2d0f-f161-4ea3-a777-78faae59bea0_en"
    private const val MAX_STALE_DAYS = 21L

    fun parse(
        xlsxBytes: ByteArray,
        requestedDate: LocalDate,
        ronToEurResolver: (LocalDate) -> BigDecimal,
    ): Map<String, ProviderFuelPrice> {
        XSSFWorkbook(ByteArrayInputStream(xlsxBytes)).use { workbook ->
            val sheet = workbook.getSheetAt(0)
                ?: throw IllegalStateException("Empty EU Weekly Oil Bulletin workbook")
            val dateRow = sheet.getRow(1)
                ?: throw IllegalStateException("Missing date row in EU Weekly Oil Bulletin")
            val dateCell = dateRow.getCell(0)
                ?: throw IllegalStateException("Missing date cell in EU Weekly Oil Bulletin")
            val bulletinDate = extractDate(dateCell)
                ?: throw IllegalStateException("Unparseable date in EU Weekly Oil Bulletin")

            if (bulletinDate.isAfter(requestedDate)) return emptyMap()
            if (ChronoUnit.DAYS.between(bulletinDate, requestedDate) > MAX_STALE_DAYS) return emptyMap()

            var romaniaRowIndex: Int? = null
            for (r in 2..sheet.lastRowNum) {
                val row = sheet.getRow(r) ?: continue
                val country = row.getCell(0)?.stringCellValue?.trim() ?: continue
                if (country.equals("Romania", ignoreCase = true)) {
                    romaniaRowIndex = r
                    break
                }
            }
            val roRow = romaniaRowIndex?.let { sheet.getRow(it) }
                ?: throw IllegalStateException("Romania row not found in EU Weekly Oil Bulletin")

            val ronToEur = ronToEurResolver(bulletinDate)
            if (ronToEur <= BigDecimal.ZERO) {
                throw IllegalStateException("RON FX rate must be positive for EU Weekly Oil Bulletin conversion")
            }

            // Columns in EUR per 1000L: B(1)=Euro-super 95, C(2)=Automotive gas oil (diesel), G(6)=LPG motor fuel
            val columnMap = mapOf(
                1 to "petrol",
                2 to "diesel",
                6 to "lpg",
            )
            val divisor = BigDecimal(1000).multiply(ronToEur)
            val result = mutableMapOf<String, ProviderFuelPrice>()

            for ((colIndex, canonicalType) in columnMap) {
                val eurPer1000L = extractNumeric(roRow.getCell(colIndex)) ?: continue
                if (eurPer1000L <= BigDecimal.ZERO) continue
                val ronPerLiter = eurPer1000L.divide(divisor, 2, RoundingMode.HALF_UP)
                if (ronPerLiter > BigDecimal.ZERO) {
                    result[canonicalType] = ProviderFuelPrice(
                        priceRonPerLiter = ronPerLiter,
                        sourceDate = bulletinDate,
                        source = FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
                        stationCount = null,
                    )
                }
            }
            return result
        }
    }

    private fun extractDate(cell: Cell): LocalDate? = when (cell.cellType) {
        CellType.NUMERIC -> DateUtil.getLocalDateTime(cell.numericCellValue).toLocalDate()
        CellType.STRING -> try {
            LocalDate.parse(cell.stringCellValue.trim())
        } catch (_: Exception) {
            null
        }
        else -> null
    }

    private fun extractNumeric(cell: Cell?): BigDecimal? {
        if (cell == null) return null
        val numeric = when (cell.cellType) {
            CellType.NUMERIC -> cell.numericCellValue
            CellType.FORMULA -> if (cell.cachedFormulaResultType == CellType.NUMERIC) cell.numericCellValue else return null
            CellType.STRING -> return cell.stringCellValue.trim().toBigDecimalOrNull()
            else -> return null
        }
        return if (numeric.isFinite()) BigDecimal.valueOf(numeric) else null
    }
}

@Component
class HttpFuelPriceProvider(
    private val objectMapper: ObjectMapper,
    private val fxService: FxService,
    private val appSettingRepository: AppSettingRepository? = null,
) : FuelPriceProvider {
    private val log = LoggerFactory.getLogger(javaClass)
    private val providerStates = ConcurrentHashMap<FuelPriceSource, FuelProviderHealthState>()
    private val restClient = RestClient.builder()
        .requestFactory(
            JdkClientHttpRequestFactory(
                HttpClient.newBuilder()
                    .followRedirects(HttpClient.Redirect.NORMAL)
                    .connectTimeout(Duration.ofSeconds(5))
                    .build(),
            ).also { it.setReadTimeout(Duration.ofSeconds(15)) },
        )
        .build()

    private class CachedPayload<T>(
        val value: T,
        val expiresAt: Instant,
    )

    @Volatile
    private var livePayloadCache: CachedPayload<String>? = null

    @Volatile
    private var dataPayloadCache: CachedPayload<String>? = null

    @Volatile
    private var euPayloadCache: CachedPayload<ByteArray>? = null

    companion object {
        const val PRIORITY_SETTING_KEY = "fuel_provider_priority"
        val EXTERNAL_SOURCES = listOf(
            FuelPriceSource.PRETCARBURANT_LIVE,
            FuelPriceSource.PRETCARBURANT_DATA,
            FuelPriceSource.EU_WEEKLY_OIL_BULLETIN,
        )
        private val LIVE_TTL = Duration.ofMinutes(15)
        private val DATA_TTL = Duration.ofMinutes(30)
        private val EU_TTL = Duration.ofHours(6)
    }

    fun getProviderPriority(): List<FuelPriceSource> {
        val stored = appSettingRepository?.findById(PRIORITY_SETTING_KEY)?.orElse(null)?.value
        if (!stored.isNullOrBlank()) {
            try {
                val list: List<String> = objectMapper.readValue(stored)
                val parsed = list.mapNotNull { name ->
                    try {
                        FuelPriceSource.valueOf(name.uppercase().trim()).takeIf { it in EXTERNAL_SOURCES }
                    } catch (_: Exception) {
                        null
                    }
                }.distinct()
                if (parsed.isNotEmpty()) {
                    val missing = EXTERNAL_SOURCES.filter { it !in parsed }
                    return parsed + missing
                }
            } catch (_: Exception) {
            }
        }
        return EXTERNAL_SOURCES
    }

    fun saveProviderPriority(priority: List<FuelPriceSource>) {
        val valid = priority.filter { it in EXTERNAL_SOURCES }.distinct()
        val allIncluded = valid + EXTERNAL_SOURCES.filter { it !in valid }
        val names = allIncluded.map { it.name }
        val setting = AppSetting(
            key = PRIORITY_SETTING_KEY,
            value = objectMapper.writeValueAsString(names),
            updatedAt = Instant.now(),
        )
        appSettingRepository?.save(setting)
    }

    fun resolvePriorityForDate(
        requestedDate: LocalDate,
        today: LocalDate = LocalDate.now(ZoneId.of("Europe/Bucharest")),
    ): List<FuelPriceSource> {
        val configured = getProviderPriority()
        if (!requestedDate.isBefore(today)) {
            return configured
        }
        val liveIdx = configured.indexOf(FuelPriceSource.PRETCARBURANT_LIVE)
        val dataIdx = configured.indexOf(FuelPriceSource.PRETCARBURANT_DATA)
        if (liveIdx < 0 || dataIdx < 0 || liveIdx >= dataIdx) {
            return configured
        }
        return configured.toMutableList().apply {
            set(liveIdx, FuelPriceSource.PRETCARBURANT_DATA)
            set(dataIdx, FuelPriceSource.PRETCARBURANT_LIVE)
        }
    }

    fun getProviderStates(): Map<FuelPriceSource, FuelProviderHealthState> = providerStates.toMap()

    /**
     * Probe one external fuel provider directly (bypassing payload TTL caches) for health & fallback visibility.
     */
    fun probeProvider(
        source: FuelPriceSource,
        requestedDate: LocalDate = LocalDate.now(ZoneId.of("Europe/Bucharest")),
        bypassCache: Boolean = true,
    ): FuelProviderHealthState {
        val startedNanos = System.nanoTime()
        return try {
            val prices = fetchAndParse(source, requestedDate, bypassCache)
            val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
            if (prices.isEmpty()) {
                val msg = "No recent fuel prices in response"
                log.warn("Fuel probe failed for {} ({}): {}", source, requestedDate, msg)
                recordFailure(source, msg, elapsedMs)
            } else {
                recordSuccess(source, prices, elapsedMs)
            }
        } catch (e: Exception) {
            val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
            val summary = summarizeError(e)
            log.warn("Fuel probe failed for {} ({}): {}", source, requestedDate, summary)
            recordFailure(source, summary, elapsedMs)
        }
    }

    override fun resolve(canonicalFuelType: String, requestedDate: LocalDate): ProviderFuelPrice? {
        val normalized = canonicalFuelType.trim().lowercase()
        val today = LocalDate.now(ZoneId.of("Europe/Bucharest"))
        val priority = resolvePriorityForDate(requestedDate, today)

        for (source in priority) {
            val startedNanos = System.nanoTime()
            try {
                val prices = fetchAndParse(source, requestedDate, bypassCache = false)
                val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
                if (prices.isNotEmpty()) {
                    recordSuccess(source, prices, elapsedMs)
                }
                val matched = prices[normalized]
                if (matched != null) {
                    return matched
                }
            } catch (e: Exception) {
                val elapsedMs = (System.nanoTime() - startedNanos) / 1_000_000L
                val summary = summarizeError(e)
                log.warn("Fuel provider {} failed for {} on {}: {}", source, normalized, requestedDate, summary)
                recordFailure(source, summary, elapsedMs)
            }
        }
        return null
    }

    private fun fetchAndParse(
        source: FuelPriceSource,
        requestedDate: LocalDate,
        bypassCache: Boolean,
    ): Map<String, ProviderFuelPrice> = when (source) {
        FuelPriceSource.PRETCARBURANT_LIVE -> {
            val json = loadStringPayload(
                url = PretCarburantLiveParser.LIVE_URL,
                cached = livePayloadCache,
                ttl = LIVE_TTL,
                bypassCache = bypassCache,
            ) { livePayloadCache = it }
            PretCarburantLiveParser.parse(json, objectMapper, requestedDate)
        }
        FuelPriceSource.PRETCARBURANT_DATA -> {
            val json = loadStringPayload(
                url = PretCarburantDataParser.DATA_URL,
                cached = dataPayloadCache,
                ttl = DATA_TTL,
                bypassCache = bypassCache,
            ) { dataPayloadCache = it }
            PretCarburantDataParser.parse(json, objectMapper, requestedDate)
        }
        FuelPriceSource.EU_WEEKLY_OIL_BULLETIN -> {
            val bytes = loadBinaryPayload(
                url = EuWeeklyOilBulletinParser.LATEST_XLSX_URL,
                cached = euPayloadCache,
                ttl = EU_TTL,
                bypassCache = bypassCache,
            ) { euPayloadCache = it }
            EuWeeklyOilBulletinParser.parse(bytes, requestedDate) { date ->
                fxService.getRate("RON", date.toString())
            }
        }
        FuelPriceSource.MANUAL_SETTING -> emptyMap()
    }

    private fun loadStringPayload(
        url: String,
        cached: CachedPayload<String>?,
        ttl: Duration,
        bypassCache: Boolean,
        store: (CachedPayload<String>) -> Unit,
    ): String {
        val now = Instant.now()
        if (!bypassCache && cached != null && now.isBefore(cached.expiresAt)) {
            return cached.value
        }
        val entity = restClient.get()
            .uri(url)
            .header("User-Agent", "xpenses/1.0")
            .retrieve()
            .toEntity(String::class.java)
        if (!entity.statusCode.is2xxSuccessful) {
            throw IllegalStateException("HTTP ${entity.statusCode.value()} from $url")
        }
        val body = entity.body?.takeIf { it.isNotBlank() }
            ?: throw IllegalStateException("Empty response from $url")
        store(CachedPayload(body, now.plus(ttl)))
        return body
    }

    private fun loadBinaryPayload(
        url: String,
        cached: CachedPayload<ByteArray>?,
        ttl: Duration,
        bypassCache: Boolean,
        store: (CachedPayload<ByteArray>) -> Unit,
    ): ByteArray {
        val now = Instant.now()
        if (!bypassCache && cached != null && now.isBefore(cached.expiresAt)) {
            return cached.value
        }
        val entity = restClient.get()
            .uri(url)
            .header("User-Agent", "xpenses/1.0")
            .retrieve()
            .toEntity(ByteArray::class.java)
        if (!entity.statusCode.is2xxSuccessful) {
            throw IllegalStateException("HTTP ${entity.statusCode.value()} from $url")
        }
        val body = entity.body?.takeIf { it.isNotEmpty() }
            ?: throw IllegalStateException("Empty binary response from $url")
        store(CachedPayload(body, now.plus(ttl)))
        return body
    }

    private fun recordSuccess(
        source: FuelPriceSource,
        prices: Map<String, ProviderFuelPrice>,
        elapsedMs: Long,
    ): FuelProviderHealthState {
        val latestDate = prices.values.maxOfOrNull { it.sourceDate }
        val state = FuelProviderHealthState(
            provider = source,
            healthy = true,
            checkedAt = Instant.now(),
            sourceDate = latestDate,
            dieselRon = prices["diesel"]?.priceRonPerLiter,
            petrolRon = prices["petrol"]?.priceRonPerLiter,
            lpgRon = prices["lpg"]?.priceRonPerLiter,
            latencyMs = elapsedMs,
            error = null,
        )
        providerStates[source] = state
        return state
    }

    private fun recordFailure(
        source: FuelPriceSource,
        error: String,
        elapsedMs: Long,
    ): FuelProviderHealthState {
        val state = FuelProviderHealthState(
            provider = source,
            healthy = false,
            checkedAt = Instant.now(),
            sourceDate = null,
            dieselRon = null,
            petrolRon = null,
            lpgRon = null,
            latencyMs = elapsedMs,
            error = error,
        )
        providerStates[source] = state
        return state
    }

    private fun summarizeError(e: Throwable): String {
        val raw = (e.message ?: e.javaClass.simpleName).replace(Regex("\\s+"), " ").trim()
        return if (raw.length > 160) raw.take(157) + "..." else raw.ifBlank { e.javaClass.simpleName }
    }
}
