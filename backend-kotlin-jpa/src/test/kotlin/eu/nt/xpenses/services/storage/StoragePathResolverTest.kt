package eu.nt.xpenses.services.storage

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.io.TempDir
import java.io.File
import java.nio.file.Path

class StoragePathResolverTest {

    @TempDir
    lateinit var tempDir: Path

    @Test
    fun resolvesNestedRelativePathBelowStorageRoot() {
        val resolved = StoragePathResolver.resolve(tempDir.toFile(), "receipts/2026/file.pdf")
        assertEquals(
            tempDir.resolve("receipts/2026/file.pdf").toFile().canonicalPath,
            resolved.canonicalPath
        )
    }

    @Test
    fun blocksParentTraversal() {
        assertThrows(IllegalArgumentException::class.java) {
            StoragePathResolver.resolve(tempDir.toFile(), "../outside.pdf")
        }
    }

    @Test
    fun blocksAbsolutePath() {
        val absoluteOutside = File(tempDir.toFile().parentFile, "outside.pdf").absolutePath

        assertThrows(IllegalArgumentException::class.java) {
            StoragePathResolver.resolve(tempDir.toFile(), absoluteOutside)
        }
    }

    @Test
    fun blocksStorageRootItself() {
        assertThrows(IllegalArgumentException::class.java) {
            StoragePathResolver.resolve(tempDir.toFile(), ".")
        }
    }
}
