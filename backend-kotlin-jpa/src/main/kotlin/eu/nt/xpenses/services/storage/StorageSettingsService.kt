package eu.nt.xpenses.services.storage

import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.StorageService
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import tools.jackson.databind.ObjectMapper

/**
 * Owns administrative storage configuration updates, secret masking/restoration,
 * and storage migration status queries.
 */
@Service
class StorageSettingsService(
    private val storageService: StorageService,
    private val appSettingRepository: AppSettingRepository,
    private val receiptRepository: ReceiptRepository,
    private val objectMapper: ObjectMapper,
) {
    companion object {
        private const val SECRET_MASK = "••••••••"
        private val SECRET_PLACEHOLDERS = setOf("••••••••", "****")
    }

    fun getMaskedStorageConfig(): StorageConfigDto = maskStorageSecrets(storageService.getStorageConfig())

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
            },
        )

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

        return maskStorageSecrets(storageService.getStorageConfig())
    }

    fun testConnection(body: StorageConfigDto): Map<String, Any?> {
        val existing = storageService.getStorageConfig()
        restoreStoredSecrets(body, existing, keepOnBlank = true)
        return storageService.testConnection(body)
    }

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
}
