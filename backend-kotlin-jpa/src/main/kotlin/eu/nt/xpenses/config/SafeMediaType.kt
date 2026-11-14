package eu.nt.xpenses.config

import org.springframework.http.ContentDisposition
import org.springframework.http.MediaType
import java.nio.charset.StandardCharsets

/**
 * Shared safe MIME type resolution for stored uploads and downloads.
 * Only known-safe extensions resolve to a specific MIME type; unknown or
 * active-content types (e.g. HTML, SVG) fall back to application/octet-stream
 * with attachment disposition.
 */
object SafeMediaType {

    private val EXTENSION_MIME_MAP = mapOf(
        "pdf" to "application/pdf",
        "jpg" to "image/jpeg",
        "jpeg" to "image/jpeg",
        "png" to "image/png",
        "gif" to "image/gif",
        "webp" to "image/webp",
        "doc" to "application/msword",
        "docx" to "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "xls" to "application/vnd.ms-excel",
        "xlsx" to "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "txt" to "text/plain",
        "csv" to "text/csv",
    )

    private val SAFE_INLINE_MIMES = setOf(
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/webp",
        "application/pdf",
    )

    fun resolveSafeMimeType(fileName: String): String {
        val ext = fileName.substringAfterLast('.', "").lowercase()
        return EXTENSION_MIME_MAP[ext] ?: MediaType.APPLICATION_OCTET_STREAM_VALUE
    }

    fun isSafeInlineMime(mimeType: String): Boolean = mimeType.lowercase() in SAFE_INLINE_MIMES

    fun safeDisposition(fileName: String, mimeType: String, forceAttachment: Boolean = false): ContentDisposition {
        val builder = if (!forceAttachment && isSafeInlineMime(mimeType)) {
            ContentDisposition.inline()
        } else {
            ContentDisposition.attachment()
        }
        return builder.filename(fileName, StandardCharsets.UTF_8).build()
    }
}
