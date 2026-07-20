package eu.nt.xpenses.models

import com.fasterxml.jackson.annotation.JsonIgnoreProperties
import com.fasterxml.jackson.annotation.JsonProperty

@JsonIgnoreProperties(ignoreUnknown = true)
data class StorageConfigDto(
    @JsonProperty("provider_type") var providerType: String = "local",
    var local: LocalStorageConfig? = null,
    var s3: S3StorageConfig? = null,
    var smb: NetworkStorageConfig? = null,
    var webdav: NetworkStorageConfig? = null,
    var sftp: NetworkStorageConfig? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class LocalStorageConfig(
    var path: String = "/app/data/receipts"
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class S3StorageConfig(
    var region: String = "us-east-1",
    var bucket: String = "",
    @JsonProperty("access_key_id") var accessKeyId: String? = null,
    @JsonProperty("secret_key") var secretKey: String? = null,
    var endpoint: String? = null
)

@JsonIgnoreProperties(ignoreUnknown = true)
data class NetworkStorageConfig(
    var password: String? = null
)
