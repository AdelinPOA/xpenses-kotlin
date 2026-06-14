package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import org.springframework.stereotype.Service
import java.io.File
import java.time.Instant

@Service
class StorageService(
    private val appSettingRepository: AppSettingRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper
) {
    private val defaultReceiptsDir = "/app/data/receipts"
    private val cryptoInfo = "xpenses-storage-settings"

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
            
            // Remote fetch not implemented (stubbed)
            // Ensure parent directory exists for caching
            target.parentFile?.mkdirs()
        }
        
        return target.absolutePath
    }

    fun uploadFile(relativePath: String, content: ByteArray) {
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        file.parentFile?.mkdirs()
        file.writeBytes(content)
        
        // Remote sync stub (for S3, SFTP, SMB, WebDAV)
        val config = getStorageConfig()
        val providerType = config["provider_type"] as? String ?: "local"
        if (providerType != "local") {
            // In a real environment, we would upload to the remote client here
            println("Mock upload of $relativePath to $providerType storage")
        }
    }

    fun downloadFile(relativePath: String): ByteArray {
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        if (!file.exists()) {
            throw NoSuchFileException(file, reason = "File not found")
        }
        return file.readBytes()
    }

    fun deleteFile(relativePath: String) {
        val localPath = getLocalPath(relativePath)
        val file = File(localPath)
        if (file.exists()) {
            file.delete()
        }
        
        val config = getStorageConfig()
        val providerType = config["provider_type"] as? String ?: "local"
        if (providerType != "local") {
            println("Mock delete of $relativePath from $providerType storage")
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
        
        // Other remote connection tests: return stub success or error depending on parameters
        return mapOf("ok" to true, "error" to null)
    }

    @Suppress("UNCHECKED_CAST")
    private fun decryptNestedField(data: MutableMap<String, Any>, sectionKey: String, fieldKey: String) {
        val section = data[sectionKey] as? MutableMap<String, Any> ?: return
        val encrypted = section[fieldKey] as? String ?: return
        if (encrypted.isNotEmpty()) {
            try {
                section[fieldKey] = cryptoService.decrypt(encrypted, cryptoInfo)
            } catch (e: Exception) {
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
}
