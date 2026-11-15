package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.config.SafeMediaType
import eu.nt.xpenses.model.InsuranceFile
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.InsuranceFileRepository
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.StorageService
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.transaction.support.TransactionTemplate
import org.springframework.web.bind.annotation.*
import org.springframework.web.multipart.MultipartFile
import org.springframework.web.server.ResponseStatusException
import org.slf4j.LoggerFactory
import java.io.File
import java.time.Instant
import java.util.UUID

@RestController
@RequestMapping("/api/insurance")
class InsuranceController(
    private val insuranceFileRepository: InsuranceFileRepository,
    private val userRepository: UserRepository,
    private val storageService: StorageService,
    private val transactionTemplate: TransactionTemplate,
    private val authorization: Authorization,
) {
    private val logger = LoggerFactory.getLogger(InsuranceController::class.java)
    @GetMapping
    @Transactional(readOnly = true)
    fun listFiles(
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): List<InsuranceFileOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val files = if (all && authorization.canViewAll(currentUser)) {
            insuranceFileRepository.findAllByOrderByCreatedAtDesc()
        } else {
            insuranceFileRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.id!!)
        }

        return files.map { mapToOut(it) }
    }

    @GetMapping("/{fileId}")
    @Transactional(readOnly = true)
    fun getFile(
        @PathVariable fileId: Int,
        request: HttpServletRequest
    ): InsuranceFileOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val file = insuranceFileRepository.findById(fileId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "File not found")
        }

        if (!authorization.canView(currentUser, file.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your file")
        }

        return mapToOut(file)
    }

    @PostMapping
    fun uploadFile(
        @RequestParam("file") upload: MultipartFile,
        @RequestParam("title") title: String,
        @RequestParam("user_id") userId: Int,
        @RequestParam(value = "description", required = false) description: String?,
        request: HttpServletRequest
    ): ResponseEntity<InsuranceFileOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canViewAll(currentUser)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only managers and admins can upload insurance files")
        }

        if (title.isBlank()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Title is required")
        }

        // Validate file
        if (upload.size > 10 * 1024 * 1024) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "File exceeds 10MB limit")
        }
        val rawOriginalName = upload.originalFilename ?: "document"
        val originalName = File(rawOriginalName).name
        val ext = originalName.substringAfterLast('.', "").lowercase()
        if (ext.isEmpty() || ext == originalName.lowercase()) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "File must have an extension. Accepted: pdf, jpg, jpeg, png, doc, docx, xls, xlsx, txt, csv")
        }
        val allowedExtensions = setOf("pdf", "jpg", "jpeg", "png", "doc", "docx", "xls", "xlsx", "txt", "csv")
        if (ext !in allowedExtensions) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "File type .$ext not allowed. Accepted: ${allowedExtensions.joinToString()}")
        }

        // Verify target user exists before writing uploaded bytes to storage.
        userRepository.findById(userId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Target user not found")
        }

        val payloadBytes = upload.bytes
        val expectedMagicMime = when (ext) {
            "pdf" -> setOf("application/pdf")
            "jpg", "jpeg" -> setOf("image/jpeg")
            "png" -> setOf("image/png")
            else -> null
        }
        if (expectedMagicMime != null) {
            storageService.validateMagicBytes(payloadBytes, expectedMagicMime)
        }

        val relativePath = "$userId/insurance/${Instant.now().epochSecond}_${UUID.randomUUID()}_$originalName"
        storageService.uploadFile(relativePath, payloadBytes)

        val now = Instant.now()
        val created = try {
            transactionTemplate.execute {
                val txTargetUser = userRepository.findById(userId).orElseThrow {
                    ResponseStatusException(HttpStatus.NOT_FOUND, "Target user not found")
                }
                val txCurrentUser = userRepository.findById(currentUser.id!!).orElseThrow {
                    ResponseStatusException(HttpStatus.NOT_FOUND, "Current user not found")
                }
                val insuranceFile = InsuranceFile(
                    user = txTargetUser,
                    title = title.trim(),
                    description = description?.trim()?.ifBlank { null },
                    filePath = relativePath,
                    fileName = originalName,
                    fileSize = upload.size,
                    fileType = SafeMediaType.resolveSafeMimeType(originalName),
                    uploadedBy = txCurrentUser,
                    createdAt = now,
                    updatedAt = now
                )
                val saved = insuranceFileRepository.save(insuranceFile)
                mapToOut(saved)
            }
        } catch (ex: Exception) {
            deleteStorageQuietly(relativePath)
            throw ex
        }

        return ResponseEntity.status(HttpStatus.CREATED).body(created)
    }

    @GetMapping("/{fileId}/download")
    fun downloadFile(
        @PathVariable fileId: Int,
        request: HttpServletRequest
    ): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val metadata = transactionTemplate.execute {
            val file = insuranceFileRepository.findById(fileId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "File not found")
            }
            if (!authorization.canView(currentUser, file.user?.id)) {
                throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your file")
            }
            Pair(file.filePath, file.fileName?.ifBlank { null } ?: "document")
        }

        val (filePath, effectiveFileName) = metadata
        val bytes = try {
            storageService.downloadFile(filePath)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "File not found on storage")
        }

        val safeMimeType = SafeMediaType.resolveSafeMimeType(effectiveFileName)
        val contentDisposition = SafeMediaType.safeDisposition(effectiveFileName, safeMimeType, forceAttachment = true)

        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, contentDisposition.toString())
            .header("X-Content-Type-Options", "nosniff")
            .contentType(MediaType.parseMediaType(safeMimeType))
            .body(bytes)
    }

    @DeleteMapping("/{fileId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteFile(
        @PathVariable fileId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canViewAll(currentUser)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only managers and admins can delete insurance files")
        }

        val path = transactionTemplate.execute {
            val file = insuranceFileRepository.findById(fileId).orElseThrow {
                ResponseStatusException(HttpStatus.NOT_FOUND, "File not found")
            }
            val filePath = file.filePath
            insuranceFileRepository.delete(file)
            filePath
        }

        deleteStorageQuietly(path)
    }

    private fun deleteStorageQuietly(path: String) {
        try {
            storageService.deleteFile(path)
        } catch (e: Exception) {
            logger.warn("Failed to delete insurance file from storage: $path", e)
        }
    }

    private fun mapToOut(f: InsuranceFile): InsuranceFileOut = InsuranceFileOut(
        id = f.id!!,
        userId = f.user?.id,
        userDisplayName = f.user?.displayName,
        title = f.title,
        description = f.description,
        filePath = f.filePath,
        fileName = f.fileName,
        fileSize = f.fileSize,
        fileType = f.fileType,
        uploadedBy = f.uploadedBy?.id,
        uploadedByName = f.uploadedBy?.displayName,
        createdAt = f.createdAt,
        updatedAt = f.updatedAt
    )
}

data class InsuranceFileOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    val title: String,
    val description: String?,
    @JsonProperty("file_path") val filePath: String,
    @JsonProperty("file_name") val fileName: String?,
    @JsonProperty("file_size") val fileSize: Long?,
    @JsonProperty("file_type") val fileType: String?,
    @JsonProperty("uploaded_by") val uploadedBy: Int?,
    @JsonProperty("uploaded_by_name") val uploadedByName: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)
