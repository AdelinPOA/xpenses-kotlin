package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.config.FxMarginsValidationException
import eu.nt.xpenses.dto.settings.DailyAllowanceOut
import eu.nt.xpenses.dto.settings.DailyAllowanceUpdate
import eu.nt.xpenses.dto.settings.FxMarginsOut
import eu.nt.xpenses.dto.settings.FxMarginsUpdate
import eu.nt.xpenses.dto.settings.MileageRatesOut
import eu.nt.xpenses.dto.settings.MileageRatesUpdate
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.FxRateRepository
import eu.nt.xpenses.repositories.InsuranceFileRepository
import eu.nt.xpenses.repositories.OcrJobRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.services.storage.StoragePathResolver
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.io.File
import java.math.BigDecimal
import java.math.RoundingMode
import java.nio.file.Files
import java.nio.file.LinkOption
import java.nio.file.Path
import java.time.Duration
import java.time.Instant

/**
 * Owns application-setting business rules: daily allowance, mileage rates,
 * FX margins, storage migration status, secret masking, and receipt orphan
 * detection. Controllers stay HTTP adapters and delegate here.
 */
@Service
class AppSettingsService @Autowired constructor(
    private val appSettingRepository: AppSettingRepository,
    private val receiptRepository: ReceiptRepository,
    private val expenseRepository: ExpenseRepository,
    private val insuranceFileRepository: InsuranceFileRepository,
    private val ocrJobRepository: OcrJobRepository,
    private val userRepository: UserRepository,
    private val storageService: StorageService,
    private val objectMapper: ObjectMapper,
    private val fxRateRepository: FxRateRepository? = null,
) {
    constructor(
        appSettingRepository: AppSettingRepository,
        receiptRepository: ReceiptRepository,
        expenseRepository: ExpenseRepository,
        insuranceFileRepository: InsuranceFileRepository,
        ocrJobRepository: OcrJobRepository,
        userRepository: UserRepository,
        storageService: StorageService,
        objectMapper: ObjectMapper,
    ) : this(
        appSettingRepository,
        receiptRepository,
        expenseRepository,
        insuranceFileRepository,
        ocrJobRepository,
        userRepository,
        storageService,
        objectMapper,
        null,
    )
    companion object {
        private const val SECRET_MASK = "••••••••"
        private val SECRET_PLACEHOLDERS = setOf("••••••••", "****")
        private const val DEFAULT_LOCAL_RECEIPTS_PATH = "/app/data/receipts"
        private const val ORPHAN_RECEIPT_MIN_AGE_HOURS = 24L
        private val RECEIPT_STORAGE_PATH =
            Regex(
                """^\d{4}/(?:0[1-9]|1[0-2])/\d+_[^/]+\.(?:jpg|jpeg|png|gif|pdf|webp)$""",
                RegexOption.IGNORE_CASE,
            )
        val DEFAULT_DAILY_ALLOWANCE_RATE: BigDecimal = BigDecimal("50.00")
        const val MOBILE_QUICK_ADD_FAB_SETTING = "mobile_quick_add_fab_enabled"
    }

    // --- Mobile UI ---

    @Transactional(readOnly = true)
    fun isMobileQuickAddFabEnabled(): Boolean =
        appSettingRepository
            .findById(MOBILE_QUICK_ADD_FAB_SETTING)
            .orElse(null)
            ?.value
            ?.toBooleanStrictOrNull() ?: false

    @Transactional
    fun updateMobileQuickAddFab(enabled: Boolean): Boolean {
        appSettingRepository.save(AppSetting(MOBILE_QUICK_ADD_FAB_SETTING, enabled.toString(), Instant.now()))
        return enabled
    }

    // --- Daily Allowance Rate ---

    fun getDailyAllowanceRate(): BigDecimal =
        appSettingRepository
            .findById("daily_allowance_rate")
            .orElse(null)
            ?.value
            ?.let { BigDecimal(it) }
            ?: DEFAULT_DAILY_ALLOWANCE_RATE

    @Transactional
    fun updateDailyAllowanceRate(rate: BigDecimal): BigDecimal {
        if (rate < BigDecimal.ZERO) {
            throw IllegalArgumentException("Daily allowance rate must be zero or positive")
        }
        appSettingRepository.save(AppSetting("daily_allowance_rate", rate.toString(), Instant.now()))
        return rate
    }

    // --- Mileage Rates ---

    fun getMileageRates(): MileageRatesOut {
        fun optionalValue(key: String) =
            appSettingRepository
                .findById(key)
                .orElse(null)
                ?.value
                ?.let { BigDecimal(it) }

        fun value(
            key: String,
            default: String,
        ) = optionalValue(key) ?: BigDecimal(default)

        val dieselPrice = value("mileage_fuel_price_ron_per_liter", "9.20")
        val petrolPrice = value("mileage_fuel_price_petrol_ron_per_liter", "9.20")
        val lpgPrice = value("mileage_fuel_price_lpg_ron_per_liter", "4.85")
        val electricPrice = optionalValue("mileage_fuel_price_electric_ron_per_liter") ?: dieselPrice

        return MileageRatesOut(
            mileageRateBeforeTax = value("mileage_rate_before_tax", "0.60"),
            mileageRateAfterTax = value("mileage_rate_after_tax", "0.40"),
            fuelConsumptionLitersPer100Km = value("mileage_fuel_consumption_l_per_100km", "7.5"),
            fuelPriceRonPerLiter = dieselPrice,
            fuelPricePetrolRonPerLiter = petrolPrice,
            fuelPriceLpgRonPerLiter = lpgPrice,
            fuelPriceElectricRonPerLiter = electricPrice,
            pensionRate = value("mileage_pension_rate", "0.25"),
            healthRate = value("mileage_health_rate", "0.10"),
            incomeTaxRate = value("mileage_income_tax_rate", "0.10"),
            taxDeductionEur = value("mileage_tax_deduction_eur", "0.00"),
        )
    }

    fun getManualFuelPrice(vehicleFuelType: String?): BigDecimal {
        val rates = getMileageRates()
        return when (vehicleFuelType?.trim()?.lowercase()) {
            "petrol", "hybrid" -> rates.fuelPricePetrolRonPerLiter
            "lpg" -> rates.fuelPriceLpgRonPerLiter
            "electric" -> rates.fuelPriceElectricRonPerLiter
            else -> rates.fuelPriceRonPerLiter
        }
    }

    @Transactional
    fun updateMileageRates(body: MileageRatesUpdate): MileageRatesOut {
        val now = Instant.now()
        body.mileageRateBeforeTax?.let { appSettingRepository.save(AppSetting("mileage_rate_before_tax", it.toString(), now)) }
        body.mileageRateAfterTax?.let { appSettingRepository.save(AppSetting("mileage_rate_after_tax", it.toString(), now)) }
        mapOf(
            "mileage_fuel_consumption_l_per_100km" to body.fuelConsumptionLitersPer100Km,
            "mileage_fuel_price_ron_per_liter" to body.fuelPriceRonPerLiter,
            "mileage_fuel_price_petrol_ron_per_liter" to body.fuelPricePetrolRonPerLiter,
            "mileage_fuel_price_lpg_ron_per_liter" to body.fuelPriceLpgRonPerLiter,
            "mileage_fuel_price_electric_ron_per_liter" to body.fuelPriceElectricRonPerLiter,
            "mileage_pension_rate" to body.pensionRate,
            "mileage_health_rate" to body.healthRate,
            "mileage_income_tax_rate" to body.incomeTaxRate,
            "mileage_tax_deduction_eur" to body.taxDeductionEur,
        ).forEach { (key, value) -> value?.let { appSettingRepository.save(AppSetting(key, it.toString(), now)) } }
        return getMileageRates()
    }

    // --- FX Margins ---

    private val defaultFxMargin = BigDecimal("0.02")
    private val defaultFxCurrencies = listOf("EUR", "USD", "GBP", "CHF", "RON")

    private fun readFxMarginsSetting(): Map<String, BigDecimal> {
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

    private fun toFxMarginsOut(parsed: Map<String, BigDecimal>): FxMarginsOut {
        val defaultFraction = parsed["*"] ?: defaultFxMargin
        val currencies = (defaultFxCurrencies + parsed.keys.filter { it != "*" }).distinct()
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

    fun getFxMargins(): FxMarginsOut = toFxMarginsOut(readFxMarginsSetting())

    @Transactional
    fun updateFxMargins(body: FxMarginsUpdate): FxMarginsOut {
        val current = readFxMarginsSetting()
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
            fxRateRepository?.deleteAllInBatch()
        }
        return toFxMarginsOut(candidate)
    }

    // --- Storage secrets ---

    /** Returns a defensive copy of [config] with any non-empty stored secrets masked. */
    fun maskStorageSecrets(config: StorageConfigDto): StorageConfigDto =
        config.copy(
            local = config.local?.copy(),
            s3 = config.s3?.let { s3 ->
                s3.copy(secretKey = if (s3.secretKey.isNullOrEmpty()) s3.secretKey else SECRET_MASK)
            },
            smb = config.smb?.let { smb ->
                smb.copy(password = if (smb.password.isNullOrEmpty()) smb.password else SECRET_MASK)
            },
            webdav = config.webdav?.let { webdav ->
                webdav.copy(password = if (webdav.password.isNullOrEmpty()) webdav.password else SECRET_MASK)
            },
            sftp = config.sftp?.let { sftp ->
                sftp.copy(password = if (sftp.password.isNullOrEmpty()) sftp.password else SECRET_MASK)
            }
        )

    /**
     * Replaces masked/placeholder secrets in [target] with the values from [stored].
     * When [keepOnBlank] is true, blank values are also treated as "unchanged".
     */
    fun restoreStoredSecrets(
        target: StorageConfigDto,
        stored: StorageConfigDto,
        keepOnBlank: Boolean,
    ) {
        target.smb?.let {
            if (it.password in SECRET_PLACEHOLDERS || (keepOnBlank && it.password.isNullOrEmpty())) {
                it.password = stored.smb?.password ?: ""
            }
        }
        target.webdav?.let {
            if (it.password in SECRET_PLACEHOLDERS || (keepOnBlank && it.password.isNullOrEmpty())) {
                it.password = stored.webdav?.password ?: ""
            }
        }
        target.sftp?.let {
            if (it.password in SECRET_PLACEHOLDERS || (keepOnBlank && it.password.isNullOrEmpty())) {
                it.password = stored.sftp?.password ?: ""
            }
        }
        target.s3?.let {
            if (it.secretKey in SECRET_PLACEHOLDERS || (keepOnBlank && it.secretKey.isNullOrEmpty())) {
                it.secretKey = stored.s3?.secretKey ?: ""
            }
        }
    }

    @Transactional
    fun updateStorageSettings(
        body: StorageConfigDto,
        migrateExisting: Boolean,
    ): StorageConfigDto {
        val oldConfig = storageService.getStorageConfig()
        restoreStoredSecrets(body, oldConfig, keepOnBlank = false)
        storageService.saveStorageConfig(body)

        if (migrateExisting) {
            storageService.startMigration(oldConfig, body, receiptRepository.findAll())
        }

        return storageService.getStorageConfig()
    }

    // --- Storage migration status ---

    fun getStorageMigrationStatus(): Map<String, Any?> {
        val idleStatus =
            mapOf(
                "status" to "idle",
                "total_files" to 0,
                "migrated_files" to 0,
                "failed_files" to 0,
                "errors" to emptyList<String>(),
            )
        val setting = appSettingRepository.findById("storage_migration_status").orElse(null) ?: return idleStatus
        return try {
            @Suppress("UNCHECKED_CAST")
            objectMapper.readValue(setting.value, Map::class.java) as Map<String, Any?>
        } catch (_: Exception) {
            idleStatus
        }
    }

    // --- Receipt orphans ---

    private fun localStorageRoot(): Path {
        val config = storageService.getStorageConfig()
        val localPath = config.local?.path ?: DEFAULT_LOCAL_RECEIPTS_PATH
        return File(localPath).canonicalFile.toPath()
    }

    private fun listLocalFiles(baseDir: Path): List<String> {
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return emptyList()

        return Files.walk(baseDir).use { paths ->
            paths
                .iterator()
                .asSequence()
                .filter { it != baseDir }
                .filter { path -> baseDir.relativize(path).none { it.toString() == "cache" } }
                .filter { Files.isRegularFile(it, LinkOption.NOFOLLOW_LINKS) }
                .map { baseDir.relativize(it).toString().replace(File.separatorChar, '/') }
                .toList()
        }
    }

    private fun referencedStoragePaths(baseDir: Path): Set<Path> {
        val references =
            buildList {
                addAll(receiptRepository.findAllFilePaths())
                addAll(expenseRepository.findAllLegacyReceiptPaths())
                addAll(insuranceFileRepository.findAllFilePaths())
                addAll(ocrJobRepository.findAllSourcePaths())
                addAll(userRepository.findAllSignaturePaths())
            }

        return references
            .mapNotNull { reference ->
                runCatching {
                    val path = Path.of(reference)
                    if (path.isAbsolute) {
                        path.toFile().canonicalFile.toPath()
                    } else {
                        StoragePathResolver.resolve(baseDir.toFile(), reference).toPath()
                    }
                }.getOrNull()
            }.toSet()
    }

    private fun isOldEnoughToDelete(
        path: Path,
        cutoff: Instant,
    ): Boolean =
        runCatching {
            Files.getLastModifiedTime(path, LinkOption.NOFOLLOW_LINKS).toInstant().isBefore(cutoff)
        }.getOrDefault(false)

    private fun findOrphanReceiptFiles(
        baseDir: Path,
        precomputedReferences: Set<Path>? = null,
    ): List<String> {
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return emptyList()

        val cutoff = Instant.now().minus(Duration.ofHours(ORPHAN_RECEIPT_MIN_AGE_HOURS))
        val referencedPaths = precomputedReferences ?: referencedStoragePaths(baseDir)
        return listLocalFiles(baseDir)
            .filter { RECEIPT_STORAGE_PATH.matches(it) }
            .filter { relativePath ->
                val file =
                    runCatching {
                        StoragePathResolver.resolve(baseDir.toFile(), relativePath).toPath()
                    }.getOrNull() ?: return@filter false
                val realFile =
                    runCatching { file.toRealPath(LinkOption.NOFOLLOW_LINKS) }.getOrNull()
                        ?: return@filter false
                realFile.startsWith(baseDir) &&
                    Files.isRegularFile(realFile, LinkOption.NOFOLLOW_LINKS) &&
                    realFile !in referencedPaths &&
                    isOldEnoughToDelete(realFile, cutoff)
            }.sorted()
    }

    fun scanOrphanReceipts(): List<String> = findOrphanReceiptFiles(localStorageRoot())

    fun cleanOrphanReceipts(): Int {
        val baseDir = localStorageRoot()
        if (!Files.isDirectory(baseDir, LinkOption.NOFOLLOW_LINKS)) return 0
        val referencedPaths = referencedStoragePaths(baseDir)
        val orphans = findOrphanReceiptFiles(baseDir, referencedPaths)
        val cutoff = Instant.now().minus(Duration.ofHours(ORPHAN_RECEIPT_MIN_AGE_HOURS))

        val cleanedFiles = mutableListOf<Path>()
        for (orphan in orphans) {
            val file =
                runCatching {
                    StoragePathResolver.resolve(baseDir.toFile(), orphan).toPath()
                }.getOrNull() ?: continue
            val realFile = runCatching { file.toRealPath(LinkOption.NOFOLLOW_LINKS) }.getOrNull() ?: continue
            if (
                realFile.startsWith(baseDir) &&
                Files.isRegularFile(realFile, LinkOption.NOFOLLOW_LINKS) &&
                realFile !in referencedPaths &&
                isOldEnoughToDelete(realFile, cutoff) &&
                Files.deleteIfExists(realFile)
            ) {
                cleanedFiles.add(realFile)
            }
        }
        return cleanedFiles.size
    }
}
