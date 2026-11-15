# Shared Models

## Overview
Shared helper data structures for pagination, raw file uploads, and storage configuration in `eu.nt.xpenses.models`.

## Interface
- `[PagedResponse.kt:PagedResponse]` — `data class PagedResponse<T>(val data: List<T>, val page: Int, val size: Int, @JsonProperty("total_elements") val totalElements: Long, @JsonProperty("total_pages") val totalPages: Int)`
- `[RawUpload.kt:RawUpload]` — `data class RawUpload(val bytes: ByteArray, val originalFilename: String, val contentType: String?)`
- `[StorageConfigDto.kt:StorageConfigDto]` — `@JsonIgnoreProperties(ignoreUnknown = true) data class StorageConfigDto(@JsonProperty("provider_type") var providerType: String = "local", var local: LocalStorageConfig? = null, var s3: S3StorageConfig? = null, var smb: NetworkStorageConfig? = null, var webdav: NetworkStorageConfig? = null, var sftp: NetworkStorageConfig? = null)`
- `[StorageConfigDto.kt:LocalStorageConfig]` — `@JsonIgnoreProperties(ignoreUnknown = true) data class LocalStorageConfig(var path: String = "/app/data/receipts")`
- `[StorageConfigDto.kt:S3StorageConfig]` — `@JsonIgnoreProperties(ignoreUnknown = true) data class S3StorageConfig(var region: String = "us-east-1", var bucket: String = "", @JsonProperty("access_key_id") var accessKeyId: String? = null, @JsonProperty("secret_key") var secretKey: String? = null, var endpoint: String? = null)`
- `[StorageConfigDto.kt:NetworkStorageConfig]` — `@JsonIgnoreProperties(ignoreUnknown = true) data class NetworkStorageConfig(var password: String? = null)`

## Invariants
- None

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.services.StorageServiceTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
