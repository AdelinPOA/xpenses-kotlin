package eu.nt.xpenses.services

import jakarta.annotation.PostConstruct
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.GCMParameterSpec
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

@Service
class CryptoService(
    @Value("\${jwt.secret:}")
    private val jwtSecret: String,
    @Value("\${encryption.secret:}")
    private val encryptionSecret: String
) {
    private val secureRandom = SecureRandom()
    private val logger = LoggerFactory.getLogger(CryptoService::class.java)

    @PostConstruct
    fun validateSecrets() {
        require(encryptionSecret.isNotBlank()) { "encryption.secret must be configured and non-blank" }
        require(jwtSecret.isNotBlank()) { "jwt.secret must be configured and non-blank" }
    }

    // Derives a Fernet key using HKDF-SHA256
    fun getFernetKey(info: String): ByteArray {
        val secret = jwtSecret.toByteArray()
        val infoBytes = info.toByteArray()
        // Derive 32 bytes: 16 bytes signing key, 16 bytes encryption key
        return hkdfSha256(secret, infoBytes, 32)
    }

    private fun getGcmKey(info: String): ByteArray {
        val secret = encryptionSecret.toByteArray()
        val infoBytes = info.toByteArray()
        // Derive 16 bytes for AES-128-GCM
        return hkdfSha256(secret, infoBytes, 16)
    }

    fun encrypt(plaintext: String, info: String): String {
        val encryptionKey = getGcmKey(info)
        val iv = ByteArray(12)
        secureRandom.nextBytes(iv)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(encryptionKey, "AES"), GCMParameterSpec(128, iv))
        val ciphertext = cipher.doFinal(plaintext.toByteArray())

        val timestamp = System.currentTimeMillis() / 1000L
        val tsBytes = ByteBuffer.allocate(8).putLong(timestamp).array()

        val token = ByteArray(1 + 8 + 12 + ciphertext.size)
        token[0] = 0x81.toByte() // Version for AES-GCM
        System.arraycopy(tsBytes, 0, token, 1, 8)
        System.arraycopy(iv, 0, token, 9, 12)
        System.arraycopy(ciphertext, 0, token, 21, ciphertext.size)

        return Base64.getUrlEncoder().withoutPadding().encodeToString(token)
    }

    fun decrypt(token: String, info: String): String {
        val tokenBytes = Base64.getUrlDecoder().decode(token)
        if (tokenBytes.isEmpty()) {
            throw IllegalArgumentException("Token too short")
        }
        return when (tokenBytes[0]) {
            0x81.toByte() -> decryptGcm(tokenBytes, info)
            0x80.toByte() -> decryptCbc(tokenBytes, info) // backward compat
            else -> throw IllegalArgumentException("Unknown encryption version: ${tokenBytes[0]}")
        }
    }

    private fun decryptGcm(tokenBytes: ByteArray, info: String): String {
        if (tokenBytes.size < 22) {
            throw IllegalArgumentException("GCM token too short")
        }
        val encryptionKey = getGcmKey(info)
        val iv = tokenBytes.sliceArray(9..20)
        val ciphertext = tokenBytes.sliceArray(21 until tokenBytes.size)

        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(encryptionKey, "AES"), GCMParameterSpec(128, iv))
        val plaintext = cipher.doFinal(ciphertext)
        return String(plaintext)
    }

    private fun decryptCbc(tokenBytes: ByteArray, info: String): String {
        val key = getFernetKey(info)
        val signingKey = key.sliceArray(0..15)
        val encryptionKey = key.sliceArray(16..31)

        if (tokenBytes.size < 73) {
            throw IllegalArgumentException("Token too short")
        }
        if (tokenBytes[0] != 0x80.toByte()) {
            throw IllegalArgumentException("Bad version")
        }

        val hmacStart = tokenBytes.size - 32
        val header = tokenBytes.sliceArray(0 until hmacStart)
        val expectedHmac = tokenBytes.sliceArray(hmacStart until tokenBytes.size)

        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(signingKey, "HmacSHA256"))
        val actualHmac = mac.doFinal(header)

        if (!MessageDigest.isEqual(expectedHmac, actualHmac)) {
            throw SecurityException("HMAC verification failed")
        }

        val iv = tokenBytes.sliceArray(9..24)
        val ciphertext = tokenBytes.sliceArray(25 until hmacStart)

        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.DECRYPT_MODE, SecretKeySpec(encryptionKey, "AES"), IvParameterSpec(iv))
        val plaintext = cipher.doFinal(ciphertext)

        return String(plaintext)
    }

    private fun hkdfSha256(ikm: ByteArray, info: ByteArray, length: Int): ByteArray {
        val prk = hmacSha256(ByteArray(32), ikm)
        val okm = ByteArray(length)
        var t = ByteArray(0)
        var i = 1
        var offset = 0
        while (offset < length) {
            val input = ByteArray(t.size + info.size + 1)
            System.arraycopy(t, 0, input, 0, t.size)
            System.arraycopy(info, 0, input, t.size, info.size)
            input[input.size - 1] = i.toByte()
            t = hmacSha256(prk, input)
            val copyLen = minOf(t.size, length - offset)
            System.arraycopy(t, 0, okm, offset, copyLen)
            offset += copyLen
            i++
        }
        return okm
    }

    private fun hmacSha256(key: ByteArray, data: ByteArray): ByteArray {
        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(key, "HmacSHA256"))
        return mac.doFinal(data)
    }
}
