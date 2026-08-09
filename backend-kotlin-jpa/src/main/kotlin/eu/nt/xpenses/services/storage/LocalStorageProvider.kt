package eu.nt.xpenses.services.storage

import org.slf4j.LoggerFactory
import java.io.File

class LocalStorageProvider(
    basePath: String
) : StorageProvider {

    private val logger = LoggerFactory.getLogger(LocalStorageProvider::class.java)
    private val baseDir: File = File(basePath).canonicalFile

    private fun resolveTargetFile(relativePath: String): File =
        StoragePathResolver.resolve(baseDir, relativePath)

    override fun upload(relativePath: String, content: ByteArray) {
        val file = resolveTargetFile(relativePath)
        file.parentFile?.mkdirs()
        file.writeBytes(content)
        logger.debug("Saved local file: {}", file.absolutePath)
    }

    override fun download(relativePath: String): ByteArray {
        val file = resolveTargetFile(relativePath)
        if (!file.exists()) {
            throw java.nio.file.NoSuchFileException("$relativePath not found in local storage")
        }
        return file.readBytes()
    }

    override fun delete(relativePath: String) {
        val file = resolveTargetFile(relativePath)
        if (file.exists()) {
            file.delete()
            logger.debug("Deleted local file: {}", file.absolutePath)
        }
    }

    override fun testConnection(): Map<String, Any?> {
        return try {
            baseDir.mkdirs()
            if (baseDir.exists() && baseDir.canWrite()) {
                mapOf("ok" to true, "error" to null)
            } else {
                mapOf("ok" to false, "error" to "Directory is not writable: ${baseDir.absolutePath}")
            }
        } catch (e: Exception) {
            mapOf("ok" to false, "error" to e.message)
        }
    }
}
