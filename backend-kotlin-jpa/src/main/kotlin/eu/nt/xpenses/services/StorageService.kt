package eu.nt.xpenses.services

import tools.jackson.databind.ObjectMapper
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.models.LocalStorageConfig
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.storage.LocalStorageProvider
import eu.nt.xpenses.services.storage.S3StorageProvider
import eu.nt.xpenses.services.storage.StorageMigrationEngine
import eu.nt.xpenses.services.storage.StoragePathResolver
import eu.nt.xpenses.services.storage.StorageProvider
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.beans.factory.annotation.Value
import org.springframework.cache.annotation.CacheEvict
import org.springframework.cache.annotation.Cacheable
import org.springframework.http.HttpStatus
import org.springframework.stereotype.Service
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.net.URI
import java.net.UnknownHostException
import java.time.Instant
import java.util.concurrent.Executor

enum class StorageContext(
    val allowedExtensions: Set<String>,
    val maxSizeInBytes: Long,
    val pathBuilder: (entityId: Int, filename: String) -> String,
) {
    OCR_SOURCE(
        allowedExtensions = setOf("jpg", "jpeg", "png", "pdf", "webp"),
        maxSizeInBytes = 10L * 1024 * 1024,
        pathBuilder = { entityId, filename ->
            "ocr-sources/${entityId}_$filename"
        },
    ),
    RECEIPT(
        allowedExtensions = setOf("jpg", "jpeg", "png", "gif", "pdf", "webp"),
        maxSizeInBytes = 10L * 1024 * 1024,
        pathBuilder = { entityId, filename ->
            val now = java.time.LocalDate.now()
            val year = now.year
            val month = String.format("%02d", now.monthValue)
            "$year/$month/${entityId}_${java.util.UUID.randomUUID()}_$filename"
        },
    ),
    SIGNATURE(
        allowedExtensions = setOf("png"),
        maxSizeInBytes = 2L * 1024 * 1024,
        pathBuilder = { entityId, filename ->
            "signatures/${entityId}_$filename"
        },
    ),
    ;

    fun buildPath(
        entityId: Int,
        filename: String,
    ): String = pathBuilder(entityId, filename)
}

@Service
open class StorageService(
    private val appSettingRepository: AppSettingRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper,
    @Qualifier("applicationTaskExecutor") private val executor: Executor,
    private val transactionTemplate: TransactionTemplate,
    private val migrationStateStore: eu.nt.xpenses.services.storage.StorageMigrationStateStore = eu.nt.xpenses.services.storage.NoopStorageMigrationStateStore,
    @Value("\${storage.location:/app/data/receipts}") private val defaultReceiptsDir: String = "/app/data/receipts",
) : AutoCloseable {
    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024
    }

    private val logger = LoggerFactory.getLogger(StorageService::class.java)
    private val cryptoInfo = "xpenses-storage-settings"
    private val dnsResolver = PublicAddressDnsResolver()

    private val migrationEngine = StorageMigrationEngine(executor, migrationStateStore)

    @Volatile
    private var activeProvider: StorageProvider = LocalStorageProvider(defaultReceiptsDir)

    @Volatile
    private var remoteProvider: StorageProvider? = null

    @PostConstruct
    private fun initProvider() {
        val config = getStorageConfig()
        setupProviders(config)
    }

    override fun close() {
        remoteProvider?.let { runCatching { it.close() } }
        remoteProvider = null
    }

    private fun setupProviders(config: StorageConfigDto) {
        val previousRemote = remoteProvider
        val localDir = config.local?.path?.takeIf { it.isNotBlank() } ?: defaultReceiptsDir
        val localProvider = LocalStorageProvider(localDir)

        when (config.providerType) {
            "s3" -> {
                val s3Config = config.s3
                if (s3Config != null) {
                    val s3Provider =
                        S3StorageProvider(
                            region = s3Config.region,
                            bucket = s3Config.bucket,
                            accessKeyId = s3Config.accessKeyId,
                            secretAccessKey = s3Config.secretKey,
                            endpointOverride = s3Config.endpoint,
                        )
                    remoteProvider = s3Provider
                    activeProvider = s3Provider
                } else {
                    remoteProvider = null
                    activeProvider = localProvider
                }
            }

            else -> {
                remoteProvider = null
                activeProvider = localProvider
            }
        }
        if (previousRemote != null && previousRemote !== remoteProvider) {
            runCatching { previousRemote.close() }
        }
    }

    private fun createProvider(
        providerType: String,
        config: StorageConfigDto,
    ): StorageProvider {
        val localDir = config.local?.path?.takeIf { it.isNotBlank() } ?: defaultReceiptsDir
        return when (providerType) {
            "s3" -> {
                val s3Config = config.s3
                if (s3Config != null) {
                    S3StorageProvider(
                        region = s3Config.region,
                        bucket = s3Config.bucket,
                        accessKeyId = s3Config.accessKeyId,
                        secretAccessKey = s3Config.secretKey,
                        endpointOverride = s3Config.endpoint,
                    )
                } else {
                    LocalStorageProvider(localDir)
                }
            }

            else -> {
                LocalStorageProvider(localDir)
            }
        }
    }

    @Cacheable("storage-config-cache")
    fun getStorageConfig(): StorageConfigDto {
        val setting =
            appSettingRepository.findById("storage_config").orElse(null)
                ?: return StorageConfigDto(
                    providerType = "local",
                    local = LocalStorageConfig(path = defaultReceiptsDir),
                )

        val data: StorageConfigDto =
            try {
                objectMapper.readValue(setting.value, StorageConfigDto::class.java)
            } catch (e: Exception) {
                StorageConfigDto()
            }

        // Decrypt sensitive fields
        data.smb?.password = decryptField(data.smb?.password)
        data.webdav?.password = decryptField(data.webdav?.password)
        data.sftp?.password = decryptField(data.sftp?.password)
        data.s3?.secretKey = decryptField(data.s3?.secretKey)

        if (data.local == null) {
            data.local = LocalStorageConfig(path = defaultReceiptsDir)
        }

        return data
    }

    fun validateConfig(configData: StorageConfigDto) {
        val localPath = configData.local?.path
        if (!localPath.isNullOrBlank()) {
            val canonicalTarget =
                try {
                    File(localPath).canonicalFile.toPath()
                } catch (_: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid local storage path")
                }
            val defaultBase = File(defaultReceiptsDir).canonicalFile
            val defaultAllowed = defaultBase.parentFile?.takeIf { it.parentFile != null } ?: defaultBase
            val allowedRoots = listOfNotNull(
                File("/app/data").canonicalFile.toPath(),
                defaultAllowed.toPath(),
                System.getProperty("java.io.tmpdir")?.takeIf { it.isNotBlank() }?.let { File(it).canonicalFile.toPath() },
            )
            if (allowedRoots.none { canonicalTarget.startsWith(it) }) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Local storage path is outside allowed directories")
            }
        }

        val endpoint = configData.s3?.endpoint?.takeIf { it.isNotBlank() }
        if (endpoint != null) {
            val uri =
                try {
                    URI(endpoint)
                } catch (_: Exception) {
                    throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid S3 endpoint URL")
                }
            val scheme = uri.scheme?.lowercase()
            if (scheme !in setOf("http", "https") || !uri.userInfo.isNullOrEmpty() || uri.query != null || uri.fragment != null) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid S3 endpoint URL")
            }
            if (uri.port != -1 && uri.port !in 1..65535) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid S3 endpoint port")
            }
            val host = uri.host?.takeIf { it.isNotBlank() }
                ?: throw ResponseStatusException(HttpStatus.BAD_REQUEST, "S3 endpoint must include a host")
            val normalizedHost = host.lowercase()
            if (normalizedHost == "localhost" || normalizedHost.endsWith(".localhost") ||
                normalizedHost.endsWith(".local") || normalizedHost.endsWith(".internal") ||
                normalizedHost == "metadata" || normalizedHost.startsWith("metadata.")
            ) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "S3 endpoint host is not allowed")
            }
            try {
                dnsResolver.resolve(host)
            } catch (_: UnknownHostException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "S3 endpoint host is not allowed or cannot be resolved")
            }
        }
    }

    @CacheEvict("storage-config-cache", allEntries = true)
    fun saveStorageConfig(configData: StorageConfigDto) {
        val maskedPatterns = listOf("••••••••", "****", "········", "————")

        fun isMasked(value: String?): Boolean = value != null && value.isNotBlank() && value.trim() in maskedPatterns

        for (label in listOf("smb", "webdav", "sftp")) {
            val nc =
                when (label) {
                    "smb" -> configData.smb
                    "webdav" -> configData.webdav
                    else -> configData.sftp
                }
            if (nc?.password != null && isMasked(nc.password)) {
                throw ResponseStatusException(
                    HttpStatus.BAD_REQUEST,
                    "Storage config for '$label' contains a masked/placeholder password. Please enter the actual password.",
                )
            }
        }
        val s3 = configData.s3
        if (s3?.secretKey != null && isMasked(s3.secretKey)) {
            throw ResponseStatusException(
                HttpStatus.BAD_REQUEST,
                "S3 secret key contains a masked/placeholder value. Please enter the actual key.",
            )
        }

        validateConfig(configData)

        // Create deep copy for encryption
        val jsonStr = objectMapper.writeValueAsString(configData)
        val data: StorageConfigDto = objectMapper.readValue(jsonStr, StorageConfigDto::class.java)

        data.smb?.password = encryptField(data.smb?.password, "smb", "password")
        data.webdav?.password = encryptField(data.webdav?.password, "webdav", "password")
        data.sftp?.password = encryptField(data.sftp?.password, "sftp", "password")
        data.s3?.secretKey = encryptField(data.s3?.secretKey, "s3", "secret_key")

        val setting =
            AppSetting(
                key = "storage_config",
                value = objectMapper.writeValueAsString(data),
                updatedAt = Instant.now(),
            )
        appSettingRepository.save(setting)

        // Re-initialize provider with updated config
        val plainConfig: StorageConfigDto = objectMapper.readValue(jsonStr, StorageConfigDto::class.java)
        setupProviders(plainConfig)
    }

    fun getLocalPath(relativePath: String): String {
        val config = getStorageConfig()
        val localDir = config.local?.path?.takeIf { it.isNotBlank() } ?: defaultReceiptsDir
        if (config.providerType == "local") {
            val target = StoragePathResolver.resolve(File(localDir), relativePath)
            target.parentFile?.mkdirs()
            return target.absolutePath
        }

        // Remote provider: use cache directory.
        val cacheBase = File(File(localDir).canonicalFile, "cache")
        val target = StoragePathResolver.resolve(cacheBase, relativePath)

        if (!target.exists()) {
            val fallbackBase = File(defaultReceiptsDir)
            val fallbackTarget = StoragePathResolver.resolve(fallbackBase, relativePath)
            if (fallbackTarget.exists()) {
                return fallbackTarget.absolutePath
            }

            val remote = remoteProvider
            if (remote != null) {
                try {
                    val remoteBytes = remote.download(relativePath)
                    target.parentFile?.mkdirs()
                    target.writeBytes(remoteBytes)
                    return target.absolutePath
                } catch (e: Exception) {
                    logger.warn("Failed to fetch $relativePath from remote storage: ${e.message}")
                }
            }
        }

        return target.absolutePath
    }

    fun validateMagicBytes(
        bytes: ByteArray,
        allowedTypes: Set<String> = setOf("image/jpeg", "image/png", "application/pdf", "image/webp", "image/gif"),
    ) {
        if (bytes.size < 4) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "File payload is empty or too small")
        }
        val headerHex = bytes.take(8).joinToString("") { "%02X".format(it) }
        val isJpeg = headerHex.startsWith("FFD8FF")
        val isPng = headerHex.startsWith("89504E47")
        val isPdf = headerHex.startsWith("25504446")
        val isWebp = headerHex.startsWith("52494646") && bytes.size >= 12 && String(bytes.sliceArray(8..11)).equals("WEBP")
        val isGif = headerHex.startsWith("47494638")

        val matched =
            when {
                isJpeg -> "image/jpeg"
                isPng -> "image/png"
                isPdf -> "application/pdf"
                isWebp -> "image/webp"
                isGif -> "image/gif"
                else -> "unknown"
            }

        if (matched !in allowedTypes) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported or invalid file format detected via magic bytes")
        }
    }

    open fun storeFile(
        context: StorageContext,
        upload: eu.nt.xpenses.models.RawUpload,
        entityId: Int,
    ): String {
        if (upload.bytes.size > context.maxSizeInBytes) {
            throw ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "File exceeds size limit")
        }

        val rawFilename = java.io.File(upload.originalFilename).name
        val ext = rawFilename.substringAfterLast(".", "").lowercase()
        if (ext !in context.allowedExtensions) {
            throw IllegalArgumentException("File type .$ext not allowed")
        }

        val mapping =
            mapOf(
                "jpg" to "image/jpeg",
                "jpeg" to "image/jpeg",
                "png" to "image/png",
                "pdf" to "application/pdf",
                "webp" to "image/webp",
                "gif" to "image/gif",
            )
        val allowedMimeTypes = context.allowedExtensions.mapNotNull { mapping[it] }.toSet()
        validateMagicBytes(upload.bytes, allowedMimeTypes)

        val safeName = rawFilename.replace(" ", "_")
        val relativePath = context.buildPath(entityId, safeName)

        uploadFile(relativePath, upload.bytes)
        return relativePath
    }

    fun uploadFile(
        relativePath: String,
        content: ByteArray,
    ) {
        if (content.size > MAX_FILE_SIZE) throw ResponseStatusException(HttpStatus.CONTENT_TOO_LARGE, "File too large")

        // Always write to local cache/storage first
        val config = getStorageConfig()
        val localDir = config.local?.path ?: defaultReceiptsDir
        // Validate the path before passing it to any provider, including remote sync.
        StoragePathResolver.resolve(File(localDir), relativePath)
        val localProvider = LocalStorageProvider(localDir)
        localProvider.upload(relativePath, content)

        // Sync to remote if configured
        val remote = remoteProvider
        if (remote != null) {
            try {
                remote.upload(relativePath, content)
            } catch (e: Exception) {
                logger.error("Failed to upload $relativePath to remote storage: ${e.message}", e)
                try {
                    localProvider.delete(relativePath)
                } catch (_: Exception) {
                }
                throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "Remote storage upload failed: ${e.message}", e)
            }
        }
    }

    fun downloadFile(relativePath: String): ByteArray {
        val config = getStorageConfig()
        val localDir = config.local?.path ?: defaultReceiptsDir
        val localProvider = LocalStorageProvider(localDir)

        try {
            return localProvider.download(relativePath)
        } catch (e: java.nio.file.NoSuchFileException) {
            // Local missing, fall back to remote if available
            val remote = remoteProvider
            if (remote != null) {
                val remoteBytes = remote.download(relativePath)
                localProvider.upload(relativePath, remoteBytes)
                return remoteBytes
            }
            throw e
        }
    }

    fun deleteFile(relativePath: String) {
        val config = getStorageConfig()
        val localDir = config.local?.path ?: defaultReceiptsDir
        val localProvider = LocalStorageProvider(localDir)
        localProvider.delete(relativePath)

        val remote = remoteProvider
        if (remote != null) {
            try {
                remote.delete(relativePath)
            } catch (e: Exception) {
                logger.error("Failed to delete $relativePath from remote storage: ${e.message}")
            }
        }
    }

    /** Retention retains its DB pointer when either remote or local deletion fails. */
    fun deleteOcrSource(relativePath: String) {
        require(Regex("""ocr-sources/[^/\\\\]+""").matches(relativePath) &&
            relativePath.substringAfter('/') !in setOf(".", "..")) { "Not an OCR source path" }
        val config = getStorageConfig()
        val localDir = config.local?.path ?: defaultReceiptsDir
        val base = File(localDir).canonicalFile
        val target = StoragePathResolver.resolve(base, relativePath)
        val sourceDir = File(base, "ocr-sources")
        require(target.parentFile == sourceDir.canonicalFile &&
            !java.nio.file.Files.isSymbolicLink(sourceDir.toPath()) &&
            !java.nio.file.Files.isSymbolicLink(File(base, relativePath).toPath())) { "Not a direct OCR source file" }
        // Delete remote first. Unlike general receipt deletion, errors must propagate.
        remoteProvider?.delete(relativePath)
        // File.delete() silently returns false on failure. Retention must not clear
        // its final database pointer until local deletion actually succeeds.
        java.nio.file.Files.deleteIfExists(target.toPath())
    }

    fun testConnection(configData: StorageConfigDto): Map<String, Any?> {
        validateConfig(configData)
        return createProvider(configData.providerType, configData).use { provider ->
            provider.testConnection()
        }
    }

    private fun decryptField(encrypted: String?): String? {
        if (encrypted.isNullOrEmpty()) return encrypted
        return try {
            cryptoService.decrypt(encrypted, cryptoInfo)
        } catch (e: Exception) {
            logger.warn("Failed to decrypt storage config field: ${e.message}")
            ""
        }
    }

    private fun encryptField(
        plain: String?,
        sectionKey: String,
        fieldKey: String,
    ): String? {
        if (plain == "••••••••") {
            val existing = getStorageConfig()
            val existingPlain =
                when (sectionKey) {
                    "smb" -> existing.smb?.password
                    "webdav" -> existing.webdav?.password
                    "sftp" -> existing.sftp?.password
                    "s3" -> existing.s3?.secretKey
                    else -> ""
                } ?: ""
            return if (existingPlain.isNotEmpty()) {
                cryptoService.encrypt(existingPlain, cryptoInfo)
            } else {
                ""
            }
        } else if (!plain.isNullOrEmpty()) {
            return cryptoService.encrypt(plain, cryptoInfo)
        }
        return ""
    }

    fun startMigration(
        oldConfig: StorageConfigDto,
        newConfig: StorageConfigDto,
        receipts: List<eu.nt.xpenses.model.Receipt>,
    ) {
        val filePaths = receipts.map { it.filePath }.distinct()
        val jobId =
            java.util.UUID
                .randomUUID()
                .toString()
        val oldProvider = createProvider(oldConfig.providerType, oldConfig)
        val newProvider = createProvider(newConfig.providerType, newConfig)
        try {
            val statusSetting =
                AppSetting(
                    key = "storage_migration_status",
                    value =
                        objectMapper.writeValueAsString(
                            mapOf(
                                "job_id" to jobId,
                                "status" to "running",
                                "total_files" to filePaths.size,
                                "migrated_files" to 0,
                                "failed_files" to 0,
                                "errors" to emptyList<String>(),
                            ),
                        ),
                    updatedAt = Instant.now(),
                )
            appSettingRepository.save(statusSetting)

            migrationEngine.executeMigrationAsync(oldProvider, newProvider, filePaths, jobId = jobId) { result, isComplete ->
                try {
                    transactionTemplate.execute {
                        val statusStr =
                            if (isComplete) {
                                if (result.failedFiles == 0) "completed" else "failed"
                            } else {
                                "running"
                            }

                        appSettingRepository.save(
                            AppSetting(
                                key = "storage_migration_status",
                                value =
                                    objectMapper.writeValueAsString(
                                        mapOf(
                                            "status" to statusStr,
                                            "total_files" to result.totalFiles,
                                            "migrated_files" to result.migratedFiles,
                                            "failed_files" to result.failedFiles,
                                            "errors" to result.errors,
                                        ),
                                    ),
                                updatedAt = Instant.now(),
                            ),
                        )
                    }
                } finally {
                    if (isComplete) {
                        runCatching { oldProvider.close() }
                        runCatching { newProvider.close() }
                    }
                }
            }
        } catch (exception: Exception) {
            runCatching { oldProvider.close() }
            runCatching { newProvider.close() }
            throw exception
        }
    }
}
