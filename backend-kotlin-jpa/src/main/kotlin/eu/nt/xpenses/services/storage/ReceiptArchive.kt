package eu.nt.xpenses.services.storage

import java.io.InputStream

data class StoredContent(
    val contentType: String,
    val filename: String,
    val sizeBytes: Long,
    val sha256: String,
    val relativePath: String
)

/**
 * Domain port for durable accounting receipts.
 *
 * Immutability guarantee: There is intentionally NO delete operation in this contract.
 * Receipts are append-only fiscal proofs.
 */
interface ReceiptArchive {
    /**
     * Stores a receipt document durably and calculates its SHA-256 checksum.
     * Streams directly from InputStream without loading full file into memory.
     */
    fun append(
        receiptId: Int,
        content: InputStream,
        contentType: String,
        filename: String
    ): StoredContent

    /**
     * Opens an input stream for reading the receipt content.
     */
    fun open(relativePath: String): InputStream

    /**
     * Verifies the integrity and calculates the SHA-256 checksum of an existing stored receipt.
     */
    fun verify(relativePath: String): StoredContent
}
