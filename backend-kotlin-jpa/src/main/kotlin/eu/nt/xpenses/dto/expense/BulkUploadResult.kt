package eu.nt.xpenses.dto.expense

data class BulkUploadResult(
    val created: List<ExpenseOut>,
    val errors: List<BulkUploadError>
)
