package eu.nt.xpenses.expense

import eu.nt.xpenses.config.SafeMediaType
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.Receipt
import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.ReceiptRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import org.slf4j.LoggerFactory
import org.springframework.http.HttpStatus
import org.springframework.transaction.support.TransactionSynchronization
import org.springframework.transaction.support.TransactionSynchronizationManager
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import java.time.Instant

internal class ExpenseReceipts(
    private val expenseRepository: ExpenseRepository,
    private val receiptRepository: ReceiptRepository,
    private val storageService: StorageService,
    private val authorization: Authorization,
) {
    private val log = LoggerFactory.getLogger(ExpenseReceipts::class.java)

    fun requireUploadAllowed(expenseId: Int, currentUser: User): Expense {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canMutate(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can perform this action")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can have receipts uploaded")
        }
        if (expense.report != null && expense.report?.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only expenses on draft reports can be modified")
        }
        return expense
    }

    fun upload(expenseId: Int, files: List<MultipartFile>, currentUser: User): List<Map<String, Any>> {
        val expense = requireUploadAllowed(expenseId, currentUser)
        val now = Instant.now()
        val savedReceiptsList = mutableListOf<Map<String, Any>>()
        val stagedPaths = mutableListOf<String>()

        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCompletion(status: Int) {
                    if (status != TransactionSynchronization.STATUS_COMMITTED) {
                        for (path in stagedPaths) {
                            try {
                                storageService.deleteFile(path)
                            } catch (e: Exception) {
                                log.warn("Failed to clean up uncommitted receipt file '{}': {}", path, e.message)
                            }
                        }
                    }
                }
            })
        }

        for (file in files) {
            val originalName = file.originalFilename ?: "receipt"
            val rawUpload = RawUpload(
                bytes = file.bytes,
                originalFilename = originalName,
                contentType = file.contentType
            )
            val relativePath = try {
                storageService.storeFile(StorageContext.RECEIPT, rawUpload, expenseId)
            } catch (e: IllegalArgumentException) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, e.message)
            }
            stagedPaths.add(relativePath)

            val receipt = Receipt(
                expense = expense,
                filePath = relativePath,
                originalName = originalName,
                createdAt = now
            )
            val savedReceipt = receiptRepository.save(receipt)
            // Keep both sides consistent for an already-initialized collection
            // (notably the bulk response in an open request EntityManager).
            if (expense.receipts.none { it.id == savedReceipt.id }) {
                expense.receipts.add(savedReceipt)
            }
            savedReceiptsList.add(
                mapOf(
                    "id" to savedReceipt.id!!,
                    "file_path" to relativePath,
                    "original_name" to originalName
                )
            )
        }
        expense.updatedAt = now
        expenseRepository.save(expense)
        return savedReceiptsList
    }

    fun deleteSingle(expenseId: Int, receiptId: Int, currentUser: User) {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }
        if (!authorization.canMutate(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only the owner can delete receipts")
        }
        if (expense.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only draft expenses can have receipts deleted")
        }
        if (expense.report != null && expense.report?.status != "draft") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only expenses on draft reports can be modified")
        }

        val receipt = receiptRepository.findById(receiptId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
        }
        if (receipt.expense.id != expenseId) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
        }

        val filePath = receipt.filePath
        expense.receipts.removeIf { it.id == receiptId }
        receiptRepository.delete(receipt)
        expense.updatedAt = Instant.now()
        expenseRepository.save(expense)

        deletePathsAfterCommit(listOf(filePath))
    }

    fun deletePathsAfterCommit(paths: List<String>) {
        if (paths.isEmpty()) return
        if (TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(object : TransactionSynchronization {
                override fun afterCommit() {
                    for (path in paths) {
                        try {
                            storageService.deleteFile(path)
                        } catch (e: Exception) {
                            log.warn("Failed to delete receipt file '{}': {}", path, e.message)
                        }
                    }
                }
            })
        } else {
            for (path in paths) {
                try {
                    storageService.deleteFile(path)
                } catch (e: Exception) {
                    log.warn("Failed to delete receipt file '{}': {}", path, e.message)
                }
            }
        }
    }

    fun getDownload(expenseId: Int, receiptId: Int?, currentUser: User): Triple<ByteArray, String, String> {
        val expense = expenseRepository.findById(expenseId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Expense not found")
        }

        if (!authorization.canView(currentUser, expense.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your expense")
        }

        if (receiptId != null) {
            val receipt = receiptRepository.findById(receiptId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not found")
            }
            if (receipt.expense.id != expenseId) {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt not associated with this expense")
            }
            val bytes = try {
                storageService.downloadFile(receipt.filePath)
            } catch (e: Exception) {
                throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
            }
            val effectiveName = receipt.originalName?.ifBlank { null } ?: receipt.filePath.substringAfterLast('/')
            val contentType = SafeMediaType.resolveSafeMimeType(effectiveName)
            return Triple(bytes, contentType, effectiveName)
        }

        val receipt = expense.receipts.minByOrNull { it.createdAt }
        if (receipt != null) {
            return getDownload(expenseId, receipt.id!!, currentUser)
        }

        val rPath = expense.receiptPath ?: throw ResponseStatusException(HttpStatus.NOT_FOUND, "No receipt found")
        val bytes = try {
            storageService.downloadFile(rPath)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Receipt file not found")
        }

        val effectiveName = rPath.substringAfterLast('/')
        val contentType = SafeMediaType.resolveSafeMimeType(effectiveName)
        return Triple(bytes, contentType, effectiveName)
    }
}
