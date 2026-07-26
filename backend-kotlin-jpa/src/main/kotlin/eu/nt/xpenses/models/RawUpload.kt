package eu.nt.xpenses.models

data class RawUpload(
    val bytes: ByteArray,
    val originalFilename: String,
    val contentType: String?
)
