package eu.nt.xpenses.dto.report

import jakarta.validation.constraints.NotEmpty

data class BulkStatusBody(
    @field:NotEmpty(message = "ids must not be empty")
    val ids: List<Int> = emptyList(),
    val action: String? = null,
    val reason: String? = null
)

data class BulkStatusFailure(
    val id: Int,
    val reason: String?
)

data class BulkStatusResult(
    val succeeded: List<Int>,
    val failed: List<BulkStatusFailure>
)
