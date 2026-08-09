package eu.nt.xpenses.ingestion

import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.util.Properties

class ImapMessageKeyTest {
    @Test
    fun usesMessageIdWhenAvailable() {
        val message = mimeMessage()
        message.setHeader("Message-ID", "<abc@example.test>")

        assertEquals("message-id:<abc@example.test>", ImapMessageKey.from(message))
    }

    @Test
    fun fallsBackToStableDigestWithoutMessageId() {
        val first = mimeMessage()
        val second = mimeMessage()
        first.from = arrayOf(InternetAddress("sender@example.test"))
        second.from = arrayOf(InternetAddress("sender@example.test"))
        first.subject = "Receipt"
        second.subject = "Receipt"

        val firstKey = ImapMessageKey.from(first)
        val secondKey = ImapMessageKey.from(second)

        assertTrue(firstKey.startsWith("fallback:"))
        assertEquals(firstKey, secondKey)
    }

    private fun mimeMessage(): MimeMessage =
        MimeMessage(Session.getInstance(Properties()))
}
