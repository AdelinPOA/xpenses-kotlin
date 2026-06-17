package eu.nt.xpenses.services.storage

interface StorageProvider {
    fun upload(relativePath: String, content: ByteArray)
    fun download(relativePath: String): ByteArray
    fun delete(relativePath: String)
    fun testConnection(): Map<String, Any?>
}
