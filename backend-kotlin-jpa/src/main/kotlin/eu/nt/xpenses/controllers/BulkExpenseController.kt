package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.expense.BulkUploadError
import eu.nt.xpenses.dto.expense.BulkUploadResult
import eu.nt.xpenses.expense.BulkExpenseInput
import eu.nt.xpenses.expense.BulkSourceFile
import eu.nt.xpenses.expense.Expenses
import eu.nt.xpenses.model.User
import eu.nt.xpenses.security.RateLimitStore
import eu.nt.xpenses.services.OcrService
import jakarta.servlet.http.HttpServletRequest
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Qualifier
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.util.concurrent.CompletableFuture
import java.util.concurrent.Executor
import java.util.concurrent.RejectedExecutionException

@RestController
@RequestMapping("/api/expenses")
class BulkExpenseController(
    private val expenses: Expenses,
    private val ocrService: OcrService,
    private val rateLimitStore: RateLimitStore,
    @Qualifier("ocrTaskExecutor") private val ocrTaskExecutor: Executor = Executor { it.run() },
) {
    private val log = LoggerFactory.getLogger(javaClass)
    private val allowedExtensions = setOf("jpg", "jpeg", "png", "pdf", "webp")

    @PostMapping("/bulk-upload")
    fun bulkUploadExpenses(
        @RequestParam("files") files: List<MultipartFile>,
        request: HttpServletRequest,
    ): ResponseEntity<BulkUploadResult> {
        val currentUser =
            request.getAttribute("currentUser") as? User
                ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")
        if (files.size > 20) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Maximum 20 files per bulk upload")
        }

        val errors = mutableListOf<BulkUploadError>()
        val validFiles = mutableListOf<BulkSourceFile>()

        for ((index, file) in files.withIndex()) {
            val filename = file.originalFilename ?: "receipt"
            val ext = filename.substringAfterLast('.', "").lowercase()
            if (ext !in allowedExtensions) {
                errors.add(BulkUploadError(filename, "File type not supported for OCR", fileIndex = index))
                continue
            }
            if (file.size > 10 * 1024 * 1024) {
                errors.add(BulkUploadError(filename, "File exceeds 10MB limit", fileIndex = index))
                continue
            }
            val fileBytes = file.bytes
            if (!OcrService.isValidOcrContent(fileBytes)) {
                errors.add(BulkUploadError(filename, "Unsupported or invalid file format detected via magic bytes", fileIndex = index))
                continue
            }
            validFiles.add(BulkSourceFile(index, file, filename, fileBytes))
        }

        val plan = expenses.prepareBulkBatch(
            allFiles = files,
            validFiles = validFiles,
            currentUser = currentUser,
            idempotencyKey = request.getHeader("Idempotency-Key"),
        )

        val nowMillis = System.currentTimeMillis()
        for (ignored in plan.filesNeedingOcr) {
            val userQuotaCount =
                rateLimitStore.record(
                    "rl:ocr_quota:user:${currentUser.id}",
                    30,
                    60_000L,
                    nowMillis,
                )
            if (userQuotaCount > 30) {
                throw ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "OCR rate limit exceeded. Please try again later.")
            }
        }

        val ocrResultsByIndex: Map<Int, Map<String, Any?>> =
            if (plan.filesNeedingOcr.isEmpty()) {
                emptyMap()
            } else if (plan.filesNeedingOcr.size == 1) {
                val single = plan.filesNeedingOcr.single()
                mapOf(single.index to runOcrSafely(single.bytes, single.filename))
            } else {
                val futures = mutableListOf<Pair<Int, CompletableFuture<Map<String, Any?>>>>()
                try {
                    for (item in plan.filesNeedingOcr) {
                        futures +=
                            item.index to
                                CompletableFuture.supplyAsync(
                                    { runOcrSafely(item.bytes, item.filename) },
                                    ocrTaskExecutor,
                                )
                    }
                    futures.associate { (idx, future) -> idx to future.join() }
                } catch (e: RejectedExecutionException) {
                    futures.forEach { (_, future) -> future.cancel(false) }
                    throw ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "OCR workers are busy. Please try again later.", e)
                }
            }

        val inputs = validFiles.map { item ->
            BulkExpenseInput(
                source = item,
                ocrResult = ocrResultsByIndex[item.index].orEmpty(),
            )
        }
        return ResponseEntity.ok(expenses.bulkCreate(inputs, errors, plan, currentUser))
    }

    private fun runOcrSafely(
        fileBytes: ByteArray,
        filename: String,
    ): Map<String, Any?> =
        try {
            ocrService.scanReceipt(fileBytes, filename)
        } catch (e: Exception) {
            log.warn("OCR failed for {}: {}", filename, e.message)
            emptyMap()
        }
}
