package eu.nt.xpenses.ingestion

import jakarta.mail.Message
import java.nio.charset.StandardCharsets
import java.security.MessageDigest

object ImapMessageKey {
    fun from(message: Message): String {
        val messageId = message.getHeader("Message-ID")?.firstOrNull()?.trim().orEmpty()
        if (messageId.isNotEmpty()) {
            return "message-id:" + messageId
        }

        val fallback = listOf(
            message.from?.joinToString(",") { it.toString() }.orEmpty(),
            message.sentDate?.time?.toString().orEmpty(),
            message.subject.orEmpty()
        ).joinToString("|")

        val digest = MessageDigest.getInstance("SHA-256")
            .digest(fallback.toByteArray(StandardCharsets.UTF_8))
            .joinToString("") { "%02x".format(it) }
        return "fallback:$digest"
    }
}
