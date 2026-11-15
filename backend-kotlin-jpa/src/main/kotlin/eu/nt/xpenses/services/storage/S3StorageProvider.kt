package eu.nt.xpenses.services.storage

import org.slf4j.LoggerFactory
import software.amazon.awssdk.auth.credentials.AwsBasicCredentials
import software.amazon.awssdk.auth.credentials.StaticCredentialsProvider
import software.amazon.awssdk.core.sync.RequestBody
import software.amazon.awssdk.regions.Region
import software.amazon.awssdk.services.s3.S3Client
import software.amazon.awssdk.services.s3.model.DeleteObjectRequest
import software.amazon.awssdk.services.s3.model.GetObjectRequest
import software.amazon.awssdk.services.s3.model.ListBucketsRequest
import software.amazon.awssdk.services.s3.model.NoSuchKeyException
import software.amazon.awssdk.services.s3.model.PutObjectRequest
import java.net.URI

class S3StorageProvider(
    region: String,
    bucket: String,
    accessKeyId: String?,
    secretAccessKey: String?,
    endpointOverride: String?
) : StorageProvider {

    private val logger = LoggerFactory.getLogger(S3StorageProvider::class.java)
    private val bucket: String = bucket

    private val s3Client: S3Client = run {
        val builder = S3Client.builder()
            .region(Region.of(region))

        if (accessKeyId != null && secretAccessKey != null) {
            builder.credentialsProvider(
                StaticCredentialsProvider.create(
                    AwsBasicCredentials.create(accessKeyId, secretAccessKey)
                )
            )
        }

        if (!endpointOverride.isNullOrBlank()) {
            builder.endpointOverride(URI.create(endpointOverride))
        }

        builder.build()
    }

    override fun upload(relativePath: String, content: ByteArray) {
        try {
            val request = PutObjectRequest.builder()
                .bucket(bucket)
                .key(relativePath)
                .build()
            s3Client.putObject(request, RequestBody.fromBytes(content))
            logger.debug("Uploaded {} to s3://{}/{}", relativePath, bucket, relativePath)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to upload $relativePath to S3: ${e.message}", e)
        }
    }

    override fun download(relativePath: String): ByteArray {
        try {
            val request = GetObjectRequest.builder()
                .bucket(bucket)
                .key(relativePath)
                .build()
            return s3Client.getObject(request).use { it.readAllBytes() }
        } catch (e: NoSuchKeyException) {
            throw java.nio.file.NoSuchFileException("$relativePath not found in S3")
        } catch (e: Exception) {
            throw IllegalStateException("Failed to download $relativePath from S3: ${e.message}", e)
        }
    }

    override fun delete(relativePath: String) {
        try {
            val request = DeleteObjectRequest.builder()
                .bucket(bucket)
                .key(relativePath)
                .build()
            s3Client.deleteObject(request)
            logger.debug("Deleted {} from s3://{}/{}", relativePath, bucket, relativePath)
        } catch (e: Exception) {
            throw IllegalStateException("Failed to delete $relativePath from S3: ${e.message}", e)
        }
    }

    override fun testConnection(): Map<String, Any?> {
        return try {
            s3Client.listBuckets(ListBucketsRequest.builder().build())
            mapOf("ok" to true, "error" to null)
        } catch (e: Exception) {
            mapOf("ok" to false, "error" to e.message)
        }
    }

    override fun close() = s3Client.close()

}
