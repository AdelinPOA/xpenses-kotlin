package eu.nt.xpenses.services.storage

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.NoSuchFileException
import java.nio.file.Path

class LocalStorageProviderTest {

    @TempDir
    lateinit var tempDir: Path

    private lateinit var provider: LocalStorageProvider

    @BeforeEach
    fun setUp() {
        provider = LocalStorageProvider(tempDir.toString())
    }

    @Test
    fun `upload and download file successfully`() {
        val path = "receipts/test.txt"
        val content = "hello storage".toByteArray()

        provider.upload(path, content)
        val downloaded = provider.download(path)

        assertArrayEquals(content, downloaded)
    }

    @Test
    fun `download missing file throws NoSuchFileException`() {
        assertThrows(NoSuchFileException::class.java) {
            provider.download("nonexistent.txt")
        }
    }

    @Test
    fun `delete file removes file from disk`() {
        val path = "receipts/to_delete.txt"
        provider.upload(path, "data".toByteArray())
        
        provider.delete(path)

        assertThrows(NoSuchFileException::class.java) {
            provider.download(path)
        }
    }

    @Test
    fun `path traversal attack is blocked`() {
        val maliciousPath = "../outside.txt"

        assertThrows(IllegalArgumentException::class.java) {
            provider.upload(maliciousPath, "hacked".toByteArray())
        }
    }

    @Test
    fun `testConnection returns ok for writable directory`() {
        val result = provider.testConnection()
        assertEquals(true, result["ok"])
        assertNull(result["error"])
    }
}
