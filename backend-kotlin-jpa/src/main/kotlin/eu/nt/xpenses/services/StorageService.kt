package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.models.LocalStorageConfig
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.storage.S3StorageProvider
import eu.nt.xpenses.services.storage.StorageProvider
import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.stereotype.Service
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import org.springframework.transaction.support.TransactionTemplate
import java.io.File
import java.time.Instant
import java.util.concurrent.Executor

@Service
class StorageService(
    private val appSettingRepository: AppSettingRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper,
    @Qualifier("applicationTaskExecutor") private val executor: Executor,
    private val transactionTemplate: TransactionTemplate
) {
    companion object {
        private const val MAX_FILE_SIZE = 50 * 1024 * 1024
    }

    private val logger = LoggerFactory.getLogger(StorageService::class.java)
    private val defaultReceiptsDir = "/app/data/receipts"
    private val cryptoInfo = "xpenses-storage-settings"

    @Volatile
    private var remoteProvider: StorageProvider? = null

    @PostConstruct
    private fun initProvider() {
        val config = getStorageConfig()
        val providerType = config.providerType
        remoteProvider = createProvider(providerType, config)
    }

    private fun createProvider(providerType: String, config: StorageConfigDto): StorageProvider? {
        return when (providerType) {
            "s3" -> {
                val s3Config = config.s3 ?: return null
                S3StorageProvider(
                    region = s3Config.region,
                    bucket = s3Config.bucket,
                    accessKeyId = s3Config.accessKeyId,
                    secretAccessKey = s3Config.secretKey,
                    endpointOverride = s3Config.endpoint
                )
            }
            "local" -> null
            else -> {
                logger.warn("Storage provider '$providerType' not implemented — only S3 and local are supported")
                null
            }
        }
    }

    fun getStorageConfig(): StorageConfigDto {
        val setting = appSettingRepository.findById("storage_config").orElse(null)
            ?: return StorageConfigDto(
                providerType = "local",
                local = LocalStorageConfig(path = defaultReceiptsDir)
            )

        val data: StorageConfigDto = try {
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

    fun saveStorageConfig(configData: StorageConfigDto) {
        // Create deep copy
        val jsonStr = objectMapper.writeValueAsString(configData)
        val data: StorageConfigDto = objectMapper.readValue(jsonStr, StorageConfigDto::class.java)

        data.smb?.password = encryptField(data.smb?.password, "smb", "password")
        data.webdav?.password = encryptField(data.webdav?.password, "webdav", "password")
        data.sftp?.password = encryptField(data.sftp?.password, "sftp", "password")
        data.s3?.secretKey = encryptField(data.s3?.secretKey, "s3", "secret_key")

        val setting = AppSetting(
            key = "storage_config",
            value = objectMapper.writeValueAsString(data),
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)

        // Re-initialize provider with updated config
        val providerType = data.providerType
        // Decrypt before passing to createProvider
        val plainConfig: StorageConfigDto = objectMapper.readValue(jsonStr, StorageConfigDto::class.java)
        remoteProvider = createProvider(providerType, plainConfig)
    }

    fun getLocalPath(relativePath: String): String {
        val config = getStorageConfig()
        val providerType = config.providerType

        val localPath = config.local?.path ?: defaultReceiptsDir
        val baseDir = File(localPath).canonicalFile

        if (providerType == "local") {
            val target = File(baseDir, relativePath).canonicalFile
            if (!target.canonicalPath.startsWith(baseDir.canonicalPath + File.separator)) {
                throw IllegalArgumentException("Invalid target filepath: path traversal detected")
            }
            // Ensure parent directory exists
            target.parentFile?.mkdirs()
            return target.absolutePath
        }

        // Remote provider: use cache directory
        val cacheBase = File(baseDir, "cache").canonicalFile
        val target = File(cacheBase, relativePath).canonicalFile
        if (!target.canonicalPath.startsWith(cacheBase.canonicalPath + File.separator)) {
            throw IllegalArgumentException("Invalid target cache path: path traversal detected")
        }

        if (!target.exists()) {
            // Check local default fallback
            val fallbackBase = File(defaultReceiptsDir).canonicalFile
            val fallbackTarget = File(fallbackBase, relativePath).canonicalFile
            if (fallbackTarget.exists() && fallbackTarget.canonicalPath.startsWith(fallbackBase.canonicalPath + File.separator)) {
                return fallbackTarget.absolutePath
            }

            // Try fetching from remote provider and cache locally
            val provider = remoteProvider
            if (provider != null) {
                try {
                    val remoteBytes = provider.download(relativePath)
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

    fun uploadFile(relativePath: String, content: ByteArray) {
        if (content.size > MAX_FILE_SIZE) throw ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "File too large")
        // Always write to local cache
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        file.parentFile?.mkdirs()
        file.writeBytes(content)

        // Sync to remote if configured
        val provider = remoteProvider
        if (provider != null) {
            try {
                provider.upload(relativePath, content)
            } catch (e: Exception) {
                logger.error("Failed to sync $relativePath to remote storage: ${e.message}")
            }
        }
    }

    fun downloadFile(relativePath: String): ByteArray {
        // Try local cache first
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        if (file.exists()) {
            return file.readBytes()
        }

        // Fall back to remote
        val provider = remoteProvider
        if (provider != null) {
            try {
                val remoteBytes = provider.download(relativePath)
                // Cache locally
                file.parentFile?.mkdirs()
                file.writeBytes(remoteBytes)
                return remoteBytes
            } catch (e: java.nio.file.NoSuchFileException) {
                throw e
            } catch (e: Exception) {
                logger.error("Failed to download $relativePath from remote: ${e.message}")
            }
        }

        throw java.nio.file.NoSuchFileException(relativePath)
    }

    fun deleteFile(relativePath: String) {
        // Delete local cache
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        if (file.exists()) {
            file.delete()
        }

        // Delete from remote
        val provider = remoteProvider
        if (provider != null) {
            try {
                provider.delete(relativePath)
            } catch (e: Exception) {
                logger.error("Failed to delete $relativePath from remote storage: ${e.message}")
            }
        }
    }

    fun testConnection(configData: StorageConfigDto): Map<String, Any?> {
        val providerType = configData.providerType
        if (providerType == "local") {
            val localPath = configData.local?.path ?: defaultReceiptsDir
            return try {
                val dir = File(localPath)
                dir.mkdirs()
                if (dir.exists() && dir.canWrite()) {
                    mapOf("ok" to true, "error" to null)
                } else {
                    mapOf("ok" to false, "error" to "Directory is not writable")
                }
            } catch (e: Exception) {
                mapOf("ok" to false, "error" to e.message)
            }
        }

        if (providerType == "s3") {
            val provider = createProvider(providerType, configData)
            if (provider != null) {
                return provider.testConnection()
            }
            return mapOf("ok" to false, "error" to "Invalid S3 configuration (missing bucket)")
        }

        return mapOf("ok" to false, "error" to "Storage provider '$providerType' is not implemented. Only 'local' and 's3' are supported.")
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

    private fun encryptField(plain: String?, sectionKey: String, fieldKey: String): String? {
        if (plain == "••••••••") {
            // Keep existing password
            val existing = getStorageConfig()
            val existingPlain = when (sectionKey) {
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

    fun startMigration(oldConfig: StorageConfigDto, newConfig: StorageConfigDto, receipts: List<eu.nt.xpenses.models.Receipt>) {
        val newProviderType = newConfig.providerType
        val oldProviderType = oldConfig.providerType

        val statusSetting = AppSetting(
            key = "storage_migration_status",
            value = objectMapper.writeValueAsString(mapOf(
                "status" to "running",
                "total_files" to receipts.size,
                "migrated_files" to 0,
                "failed_files" to 0,
                "errors" to emptyList<String>()
            )),
            updatedAt = Instant.now()
        )
        appSettingRepository.save(statusSetting)

        // Run on Spring-managed thread pool
        executor.execute {
            transactionTemplate.execute {
                val errors = mutableListOf<String>()
                var migrated = 0
                var failed = 0

                val oldProvider = createProvider(oldProviderType, oldConfig)
                val newProvider = createProvider(newProviderType, newConfig)

                for (receipt in receipts) {
                    val path = receipt.filePath ?: continue
                    try {
                        // Get file bytes from old provider
                        val bytes = if (oldProvider != null) {
                            oldProvider.download(path)
                        } else {
                            // local
                            val localPath = oldConfig.local?.path ?: defaultReceiptsDir
                            val migrationBase = File(localPath).canonicalFile
                            val migrationFile = File(migrationBase, path).canonicalFile
                            if (!migrationFile.canonicalPath.startsWith(migrationBase.canonicalPath + File.separator)) {
                                throw IllegalArgumentException("Invalid target filepath: path traversal detected")
                            }
                            migrationFile.readBytes()
                        }

                        // Write file bytes to new provider
                        if (newProvider != null) {
                            newProvider.upload(path, bytes)
                        } else {
                            // local
                            val localPath = newConfig.local?.path ?: defaultReceiptsDir
                            val dest = File(localPath, path)
                            dest.parentFile?.mkdirs()
                            dest.writeBytes(bytes)
                        }

                        migrated++
                    } catch (e: Exception) {
                        failed++
                        errors.add("Failed to migrate $path: ${e.message}")
                    }

                    // Update status in DB
                    appSettingRepository.save(AppSetting(
                        key = "storage_migration_status",
                        value = objectMapper.writeValueAsString(mapOf(
                            "status" to "running",
                            "total_files" to receipts.size,
                            "migrated_files" to migrated,
                            "failed_files" to failed,
                            "errors" to errors.take(50)
                        )),
                        updatedAt = Instant.now()
                    ))
                }

                // Completed status
                appSettingRepository.save(AppSetting(
                    key = "storage_migration_status",
                    value = objectMapper.writeValueAsString(mapOf(
                        "status" to if (failed == 0) "completed" else "failed",
                        "total_files" to receipts.size,
                        "migrated_files" to migrated,
                        "failed_files" to failed,
                        "errors" to errors.take(50)
                    )),
                    updatedAt = Instant.now()
                ))
                null
            }
        }
    }
}
