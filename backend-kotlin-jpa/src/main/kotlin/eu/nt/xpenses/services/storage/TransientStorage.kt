package eu.nt.xpenses.services.storage

import java.io.InputStream
import java.time.Instant

data class TransientObject(
    val sourceId: Int,
    val relativePath: String,
    val sizeBytes: Long,
    val sha256: String,
    val expiresAt: Instant
)

/**
 * Domain port for temporary files (OCR sources, transient scan artifacts).
 *
 * Enforces explicit lifecycle control with expiration and garbage collection.
 */
interface TransientStorage {
    /**
     * Stores a transient file with an explicit expiration timestamp.
     */
    fun stage(
        sourceId: Int,
        content: InputStream,
        contentType: String,
        filename: String,
        expiresAt: Instant
    ): TransientObject

    /**
     * Opens an input stream for reading the transient file.
     */
    fun open(relativePath: String): InputStream

    /**
     * Explicitly releases a transient file upon promotion or permanent failure.
     */
    fun release(relativePath: String, reason: String = "released")

    /**
     * Reaps orphaned or expired transient files.
     * Returns the count of deleted files.
     */
    fun reapExpired(now: Instant, limit: Int = 100): Int
}
