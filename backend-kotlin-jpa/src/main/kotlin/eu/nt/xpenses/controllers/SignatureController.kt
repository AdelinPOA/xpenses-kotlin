package eu.nt.xpenses.controllers

import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.UserRepository
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.beans.factory.annotation.Value
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.io.File
import java.util.Base64

@RestController
@RequestMapping("/api/users/me/signature")
class SignatureController(
    private val userRepository: UserRepository,
    @Value("\${signatures.dir:/app/data/signatures}") private val signaturesDir: String
) {
    private val pngMagic = byteArrayOf(
        0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
        0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte()
    )
    private val maxSize = 500 * 1024

    @GetMapping
    fun getSignature(request: HttpServletRequest, response: HttpServletResponse): ResponseEntity<ByteArray> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val path = currentUser.signaturePath
        if (path.isNullOrEmpty()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "No signature found")
        }

        val file = File(path)
        if (!file.exists()) {
            throw ResponseStatusException(HttpStatus.NOT_FOUND, "Signature file not found")
        }

        return ResponseEntity.ok()
            .contentType(MediaType.IMAGE_PNG)
            .body(file.readBytes())
    }

    @PutMapping
    fun putSignature(
        @RequestBody payload: SignaturePayload,
        request: HttpServletRequest
    ): Map<String, String> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val prefix = "data:image/png;base64,"
        if (!payload.image.startsWith(prefix)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid image format")
        }

        val base64Data = payload.image.substring(prefix.length)
        val data = try {
            Base64.getDecoder().decode(base64Data)
        } catch (e: Exception) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid base64 data")
        }

        if (data.size > maxSize) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Signature exceeds 500KB limit")
        }

        if (data.size < pngMagic.size || !data.take(pngMagic.size).toByteArray().contentEquals(pngMagic)) {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Not a valid PNG")
        }

        val dir = File(signaturesDir)
        dir.mkdirs()

        val file = File(dir, "${currentUser.id}.png")
        file.writeBytes(data)

        currentUser.signaturePath = file.absolutePath
        userRepository.save(currentUser)

        return mapOf("signature_path" to file.absolutePath)
    }

    @DeleteMapping
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteSignature(request: HttpServletRequest) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val path = currentUser.signaturePath
        if (!path.isNullOrEmpty()) {
            val file = File(path)
            if (file.exists()) {
                file.delete()
            }
        }

        currentUser.signaturePath = null
        userRepository.save(currentUser)
    }
}

data class SignaturePayload(
    val image: String
)
