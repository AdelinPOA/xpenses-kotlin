package eu.nt.xpenses.services

import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.security.SecureRandom
import java.util.Base64
import javax.crypto.Cipher
import javax.crypto.Mac
import javax.crypto.spec.IvParameterSpec
import javax.crypto.spec.SecretKeySpec

@Service
class CryptoService(
    @Value("\${jwt.secret:dev-secret-change-in-production}")
    private val jwtSecret: String
) {
    private val secureRandom = SecureRandom()

    // Derives a Fernet key using HKDF-SHA256
    fun getFernetKey(info: String): ByteArray {
        val secret = jwtSecret.toByteArray()
        val infoBytes = info.toByteArray()
        // Derive 32 bytes: 16 bytes signing key, 16 bytes encryption key
        return hkdfSha256(secret, infoBytes, 32)
    }

    fun encrypt(plaintext: String, info: String): String {
        val key = getFernetKey(info)
        val signingKey = key.sliceArray(0..15)
        val encryptionKey = key.sliceArray(16..31)

        val iv = ByteArray(16)
        secureRandom.nextBytes(iv)

        val cipher = Cipher.getInstance("AES/CBC/PKCS5Padding")
        cipher.init(Cipher.ENCRYPT_MODE, SecretKeySpec(encryptionKey, "AES"), IvParameterSpec(iv))
        val ciphertext = cipher.doFinal(plaintext.toByteArray())

        val timestamp = System.currentTimeMillis() / 1000L
        val tsBytes = ByteBuffer.allocate(8).putLong(timestamp).array()

        val header = ByteArray(1 + 8 + 16 + ciphertext.size)
        header[0] = 0x80.toByte() // Version
        System.arraycopy(tsBytes, 0, header, 1, 8)
        System.arraycopy(iv, 0, header, 9, 16)
        System.arraycopy(ciphertext, 0, header, 25, ciphertext.size)

        val mac = Mac.getInstance("HmacSHA256")
        mac.init(SecretKeySpec(signingKey, "HmacSHA256"))
        val hmac = mac.doFinal(header)

        val token = ByteArray(header.size + hmac.size)
        System.arraycopy(header, 0, token, 0, header.size)
        System.arraycopy(hmac, 0, token, header.size, hmac.size)

        return Base64.getUrlEncoder().withoutPadding().encodeToString(token)
    }

    fun decrypt(token: String, info: String): String {
        val key = getFernetKey(info)
        val signingKey = key.sliceArray(0..15)
        val encryptionKey = key.sliceArray(16..31)

        val tokenBytes = Base64.getUrlDecoder().decode(token)
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
