package eu.nt.xpenses.dto.expense

data class BulkUploadError(
    val filename: String,
    val reason: String
)
