package eu.nt.xpenses.controllers

import eu.nt.xpenses.models.StorageConfigDto
import eu.nt.xpenses.services.storage.StorageOrphanService
import eu.nt.xpenses.services.storage.StorageSettingsService
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings")
class StorageSettingsController(
    private val storageSettingsService: StorageSettingsService,
    private val storageOrphanService: StorageOrphanService,
) {
    @GetMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    fun readStorageSettings(): ResponseEntity<StorageConfigDto> =
        ResponseEntity.ok(storageSettingsService.getMaskedStorageConfig())

    @PatchMapping("/storage")
    @PreAuthorize("hasRole('mod')")
    fun updateStorageSettings(
        @RequestBody body: StorageConfigDto,
        @RequestParam(name = "migrate_existing", defaultValue = "false") migrateExisting: Boolean,
    ): ResponseEntity<StorageConfigDto> =
        ResponseEntity.ok(storageSettingsService.updateStorageSettings(body, migrateExisting))

    @PostMapping("/storage/test")
    @PreAuthorize("hasRole('mod')")
    fun testStorageSettings(
        @RequestBody body: StorageConfigDto,
    ): ResponseEntity<*> = ResponseEntity.ok(storageSettingsService.testConnection(body))

    @GetMapping("/storage/migration-status")
    @PreAuthorize("hasRole('mod')")
    fun getStorageMigrationStatus(): ResponseEntity<Map<String, Any?>> =
        ResponseEntity.ok(storageSettingsService.getStorageMigrationStatus())

    @PostMapping("/receipts/scan")
    @PreAuthorize("hasRole('mod')")
    fun scanOrphans(): ResponseEntity<*> {
        val orphans = storageOrphanService.scanOrphanReceipts()
        return ResponseEntity.ok(mapOf("orphans" to orphans, "count" to orphans.size))
    }

    @PostMapping("/receipts/clean")
    @PreAuthorize("hasRole('mod')")
    fun cleanOrphans(): ResponseEntity<*> =
        ResponseEntity.ok(mapOf("cleaned_count" to storageOrphanService.cleanOrphanReceipts()))
}
