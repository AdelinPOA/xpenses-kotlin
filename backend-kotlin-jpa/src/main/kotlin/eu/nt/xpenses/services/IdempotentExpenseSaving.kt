package eu.nt.xpenses.services

import tools.jackson.core.type.TypeReference
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.model.User
import org.springframework.stereotype.Service
import org.springframework.web.multipart.MultipartFile

/** Save orchestration, outside one encompassing transaction. */
@Service
class IdempotentExpenseSaving(
    private val expenses: ExpenseService,
    private val identities: SaveIdempotencyService,
) {
    private val expenseType = object : TypeReference<ExpenseOut>() {}
    private val receiptsType = object : TypeReference<List<Map<String, Any>>>() {}
    private val markerType = object : TypeReference<Map<String, Boolean>>() {}

    fun create(
        body: ExpenseCreate,
        user: User,
        key: String?,
    ): ExpenseOut {
        if (key == null) return expenses.createExpense(body, user)
        return identities.execute(user.id!!, "expense-create", key, identities.hash(body), expenseType) {
            expenses.createExpense(body, user)
        }
    }

    fun manifest(files: List<MultipartFile>): List<Map<String, Any>> =
        files.map { file ->
            mapOf(
                "name" to (file.originalFilename ?: "receipt"),
                "size" to file.size,
                "content_type" to (file.contentType ?: ""),
                // Rejected oversized sources are never read into heap or promoted.
                "sha256" to if (file.size > 10L * 1024 * 1024) "oversize" else identities.digest(file.bytes),
            )
        }

    /** Bind file order/content before the first per-file commit, including empty batches. */
    fun bindManifest(
        user: User,
        operation: String,
        key: String,
        manifest: List<Map<String, Any>>,
    ) {
        identities.execute(user.id!!, operation, key, identities.hash(manifest), markerType) { mapOf("accepted" to true) }
    }

    fun upload(
        expenseId: Int,
        files: List<MultipartFile>,
        user: User,
        key: String?,
    ): List<Map<String, Any>> {
        if (key == null) return expenses.uploadReceipts(expenseId, files, user)
        // Reauthorize the resource on every replay. A cached Receipt response is
        // not permission to access someone else's Expense after ownership changes.
        expenses.requireReceiptUploadAllowed(expenseId, user)
        val manifest = manifest(files)
        bindManifest(user, "receipt-manifest:$expenseId", key, manifest)
        return files.flatMapIndexed { index, file ->
            identities.execute(user.id!!, "receipt-file:$expenseId:$index", key, identities.hash(manifest[index]), receiptsType) {
                expenses.uploadReceipts(expenseId, listOf(file), user)
            }
        }
    }

    /** Pre-check cached bulk expense result so idempotent replays skip redundant OCR calls. */
    fun lookupBulkCreate(
        fileIndex: Int,
        source: Map<String, Any>,
        user: User,
        key: String?,
    ): ExpenseOut? {
        if (key == null) return null
        return identities.lookup(user.id!!, "bulk-expense:$fileIndex", key, identities.hash(source), expenseType)
    }

    /** Fingerprint the original source, NOT nondeterministic OCR/FX output. */
    fun bulkCreate(
        fileIndex: Int,
        source: Map<String, Any>,
        user: User,
        key: String?,
        create: () -> ExpenseCreate,
    ): ExpenseOut {
        if (key == null) return expenses.createExpense(create(), user)
        val operation = "bulk-expense:$fileIndex"
        val hash = identities.hash(source)
        identities.lookup(user.id!!, operation, key, hash, expenseType)?.let { return it }
        // Slow OCR happens with no row/transaction lock. Concurrent OCR can run
        // twice, but only one caller may create an Expense and commit its identity.
        val body = create()
        return identities.execute(user.id!!, operation, key, hash, expenseType) {
            expenses.createExpense(body, user)
        }
    }
}
