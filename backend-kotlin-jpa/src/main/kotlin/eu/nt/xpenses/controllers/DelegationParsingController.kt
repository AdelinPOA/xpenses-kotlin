package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.services.DelegationParsingConfig
import eu.nt.xpenses.services.DelegationParsingSettingsService
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.OcrService
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PatchMapping
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

data class DelegationPreviewIn(
    @JsonProperty("body_text") @field:NotBlank @field:Size(max = 50000) val bodyText: String,
    @field:Pattern(regexp = "ai|local") val parser: String = "ai",
    @field:Valid val settings: DelegationParsingConfig? = null,
    @JsonProperty("model_chain") @field:Size(max = 20) val modelChain: List<String>? = null,
)

data class DelegationPreviewOut(
    val success: Boolean,
    val parsed: Map<String, String>?,
    @JsonProperty("active_parser") val activeParser: String,
    val warnings: List<String> = emptyList(),
    val error: String? = null,
)

/** Preview deliberately has no sender lookup, mailbox operations, report creation, or settings writes. */
@RestController
@RequestMapping("/api/settings/imap")
@PreAuthorize("hasRole('mod')")
class DelegationParsingController(
    private val settingsService: DelegationParsingSettingsService,
    private val emailImportService: EmailImportService,
    private val ocrService: OcrService,
) {
    @GetMapping("/parsing")
    fun readSettings(): DelegationParsingConfig = settingsService.getConfig()

    @PatchMapping("/parsing")
    fun saveSettings(
        @Valid @RequestBody body: DelegationParsingConfig,
    ): DelegationParsingConfig = settingsService.saveConfig(body)

    @PostMapping("/preview")
    fun preview(
        @Valid @RequestBody body: DelegationPreviewIn,
    ): ResponseEntity<*> {
        if (body.parser == "local") {
            val parsed = emailImportService.parseDelegationEmailLocal(body.bodyText)
            return ResponseEntity.ok(
                DelegationPreviewOut(
                    success = parsed != null,
                    parsed = parsed,
                    activeParser = "local",
                    warnings =
                        listOf(
                            "Local parsing does not translate source text or apply AI instructions, examples, formatting guidance or model settings.",
                        ),
                    error = if (parsed == null) "Could not identify delegation dates in the sample email" else null,
                ),
            )
        }
        val config = ocrService.getOcrConfig()
        val chain = body.modelChain ?: config.delegationModelChain
        val activeIds =
            config.models
                .filter { it.active && it.tested }
                .map { it.id }
                .toSet()
        if (chain.distinct().size != chain.size || chain.any { it !in activeIds }) {
            return ResponseEntity.badRequest().body(mapOf("detail" to "Select distinct, active, tested email models"))
        }
        if (!config.ocrEnabled || chain.isEmpty()) {
            return ResponseEntity.ok(
                DelegationPreviewOut(false, null, "ai", error = "Email AI parsing is disabled or no email model chain is configured"),
            )
        }
        val settings = body.settings ?: settingsService.getConfig()
        val parsed = emailImportService.parseDelegationEmailWithModels(body.bodyText, config.copy(delegationModelChain = chain), settings)
        return ResponseEntity.ok(
            DelegationPreviewOut(
                success = parsed != null,
                parsed = parsed,
                activeParser = "ai",
                error =
                    if (parsed ==
                        null
                    ) {
                        "No configured AI model returned a valid delegation result. No local fallback was used."
                    } else {
                        null
                    },
            ),
        )
    }
}
