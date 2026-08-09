package eu.nt.xpenses.services.storage

import java.io.File

/**
 * Resolves a user/database-provided relative path below a configured storage root.
 * Canonicalization also prevents escaping through existing symlinks.
 */
object StoragePathResolver {
    fun resolve(baseDir: File, relativePath: String): File {
        if (File(relativePath).isAbsolute) {
            throw IllegalArgumentException("Invalid target filepath: absolute paths are not allowed")
        }

        val canonicalBase = baseDir.canonicalFile
        val target = File(canonicalBase, relativePath).canonicalFile
        val basePath = canonicalBase.path
        if (target == canonicalBase || !target.path.startsWith(basePath + File.separator)) {
            throw IllegalArgumentException("Invalid target filepath: path traversal detected")
        }
        return target
    }
}
