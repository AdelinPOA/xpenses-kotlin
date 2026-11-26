package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.OCRConfigOut
import eu.nt.xpenses.dto.settings.OCRConfigUpdate
import eu.nt.xpenses.dto.settings.OCRModelOut
import eu.nt.xpenses.dto.settings.OCRModelTestRequest
import eu.nt.xpenses.dto.settings.OCRProviderOut
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OcrService
import jakarta.validation.Valid
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/settings/ocr")
class OcrSettingsController(
    private val ocrService: OcrService,
) {
    @GetMapping
    @PreAuthorize("hasRole('mod')")
    fun readOcrSettings(): ResponseEntity<OCRConfigOut> =
        ResponseEntity.ok(toOcrSettingsOut(ocrService.getOcrConfig()))

    @PatchMapping
    @PreAuthorize("hasRole('mod')")
    fun updateOcrSettings(
        @Valid @RequestBody body: OCRConfigUpdate,
    ): ResponseEntity<*> =
        try {
            ResponseEntity.ok(toOcrSettingsOut(ocrService.updateOcrConfig(body)))
        } catch (e: IllegalArgumentException) {
            ResponseEntity.badRequest().body(mapOf("detail" to (e.message ?: "Invalid OCR configuration")))
        }

    @PostMapping("/models/test")
    @PreAuthorize("hasRole('mod')")
    fun testOcrModel(
        @Valid @RequestBody body: OCRModelTestRequest,
    ): ResponseEntity<*> = ResponseEntity.ok(ocrService.testModel(body.modelId))

    private fun toOcrSettingsOut(config: OCRConfig) =
        OCRConfigOut(
            ocrEnabled = config.ocrEnabled,
            providers = config.providers.map { OCRProviderOut(it.id, it.name, it.baseUrl, it.apiKeySet) },
            models = config.models.map { OCRModelOut(it.id, it.providerId, it.modelId, it.displayName, it.active, it.tested) },
            receiptModelChain = config.receiptModelChain,
            delegationModelChain = config.delegationModelChain,
        )
}
