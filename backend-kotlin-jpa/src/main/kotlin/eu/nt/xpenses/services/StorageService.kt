package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.AppSetting
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
        val providerType = config["provider_type"] as? String ?: "local"
        remoteProvider = createProvider(providerType, config)
    }

    private fun createProvider(providerType: String, config: Map<String, Any>): StorageProvider? {
        return when (providerType) {
            "s3" -> {
                val s3Config = config["s3"] as? Map<*, *> ?: return null
                S3StorageProvider(
                    region = s3Config["region"] as? String ?: "us-east-1",
                    bucket = s3Config["bucket"] as? String ?: return null,
                    accessKeyId = s3Config["access_key_id"] as? String,
                    secretAccessKey = s3Config["secret_key"] as? String,
                    endpointOverride = s3Config["endpoint"] as? String
                )
            }
            "local" -> null
            else -> {
                logger.warn("Storage provider '$providerType' not implemented — only S3 and local are supported")
                null
            }
        }
    }

    fun getStorageConfig(): Map<String, Any> {
        val setting = appSettingRepository.findById("storage_config").orElse(null)
            ?: return mapOf(
                "provider_type" to "local",
                "local" to mapOf("path" to defaultReceiptsDir)
            )

        val data: MutableMap<String, Any> = try {
            objectMapper.readValue(setting.value)
        } catch (e: Exception) {
            mutableMapOf()
        }

        // Decrypt sensitive fields
        decryptNestedField(data, "smb", "password")
        decryptNestedField(data, "webdav", "password")
        decryptNestedField(data, "sftp", "password")
        decryptNestedField(data, "s3", "secret_key")

        if (!data.containsKey("local")) {
            data["local"] = mapOf("path" to defaultReceiptsDir)
        }

        return data
    }

    fun saveStorageConfig(configData: Map<String, Any>) {
        // Create deep copy
        val jsonStr = objectMapper.writeValueAsString(configData)
        val data: MutableMap<String, Any> = objectMapper.readValue(jsonStr)

        encryptNestedField(data, "smb", "password")
        encryptNestedField(data, "webdav", "password")
        encryptNestedField(data, "sftp", "password")
        encryptNestedField(data, "s3", "secret_key")

        val setting = AppSetting(
            key = "storage_config",
            value = objectMapper.writeValueAsString(data),
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)

        // Re-initialize provider with updated config
        val providerType = data["provider_type"] as? String ?: "local"
        // Decrypt before passing to createProvider
        val plainConfig: MutableMap<String, Any> = objectMapper.readValue(jsonStr)
        remoteProvider = createProvider(providerType, plainConfig)
    }

    fun getLocalPath(relativePath: String): String {
        val config = getStorageConfig()
        val providerType = config["provider_type"] as? String ?: "local"

        val localConfig = config["local"] as? Map<*, *>
        val localPath = localConfig?.get("path") as? String ?: defaultReceiptsDir
        val baseDir = File(localPath).absoluteFile

        if (providerType == "local") {
            val target = File(baseDir, relativePath).absoluteFile
            if (!target.startsWith(baseDir)) {
                throw IllegalArgumentException("Invalid target filepath: path traversal detected")
            }
            // Ensure parent directory exists
            target.parentFile?.mkdirs()
            return target.absolutePath
        }

        // Remote provider: use cache directory
        val cacheBase = File(baseDir, "cache").absoluteFile
        val target = File(cacheBase, relativePath).absoluteFile
        if (!target.startsWith(cacheBase)) {
            throw IllegalArgumentException("Invalid target cache path: path traversal detected")
        }

        if (!target.exists()) {
            // Check local default fallback
            val fallbackBase = File(defaultReceiptsDir).absoluteFile
            val fallbackTarget = File(fallbackBase, relativePath).absoluteFile
            if (fallbackTarget.exists() && fallbackTarget.startsWith(fallbackBase)) {
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

    fun testConnection(configData: Map<String, Any>): Map<String, Any?> {
        val providerType = configData["provider_type"] as? String ?: "local"
        if (providerType == "local") {
            val localConfig = configData["local"] as? Map<*, *>
            val localPath = localConfig?.get("path") as? String ?: defaultReceiptsDir
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

    @Suppress("UNCHECKED_CAST")
    private fun decryptNestedField(data: MutableMap<String, Any>, sectionKey: String, fieldKey: String) {
        val section = data[sectionKey] as? MutableMap<String, Any> ?: return
        val encrypted = section[fieldKey] as? String ?: return
        if (encrypted.isNotEmpty()) {
            try {
                section[fieldKey] = cryptoService.decrypt(encrypted, cryptoInfo)
            } catch (e: Exception) {
                logger.warn("Failed to decrypt storage config field '$sectionKey.$fieldKey': ${e.message}")
                section[fieldKey] = ""
            }
        }
    }

    @Suppress("UNCHECKED_CAST")
    private fun encryptNestedField(data: MutableMap<String, Any>, sectionKey: String, fieldKey: String) {
        val section = data[sectionKey] as? MutableMap<String, Any> ?: return
        val plain = section[fieldKey] as? String ?: return
        if (plain == "••••••••") {
            // Keep existing password
            val existing = getStorageConfig()
            val existingSection = existing[sectionKey] as? Map<*, *>
            val existingPlain = existingSection?.get(fieldKey) as? String ?: ""
            section[fieldKey] = if (existingPlain.isNotEmpty()) {
                cryptoService.encrypt(existingPlain, cryptoInfo)
            } else {
                ""
            }
        } else if (plain.isNotEmpty()) {
            section[fieldKey] = cryptoService.encrypt(plain, cryptoInfo)
        } else {
            section[fieldKey] = ""
        }
    }

    fun startMigration(oldConfig: Map<String, Any>, newConfig: Map<String, Any>, receipts: List<eu.nt.xpenses.models.Receipt>) {
        val newProviderType = newConfig["provider_type"] as? String ?: "local"
        val oldProviderType = oldConfig["provider_type"] as? String ?: "local"

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
                            val localConfig = oldConfig["local"] as? Map<*, *>
                            val localPath = localConfig?.get("path") as? String ?: defaultReceiptsDir
                            File(localPath, path).readBytes()
                        }

                        // Write file bytes to new provider
                        if (newProvider != null) {
                            newProvider.upload(path, bytes)
                        } else {
                            // local
                            val localConfig = newConfig["local"] as? Map<*, *>
                            val localPath = localConfig?.get("path") as? String ?: defaultReceiptsDir
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

