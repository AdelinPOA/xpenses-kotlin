package eu.nt.xpenses.ingestion

import eu.nt.xpenses.services.EmailSettingsService
import jakarta.mail.Flags
import jakarta.mail.Folder
import jakarta.mail.Message
import jakarta.mail.Multipart
import jakarta.mail.Session
import jakarta.mail.Store
import jakarta.mail.search.FlagTerm
import jakarta.mail.search.HeaderTerm
import org.springframework.stereotype.Component
import java.util.Properties

@Component
class JavaMailMailboxAdapter(
    private val emailSettingsService: EmailSettingsService
) : MailboxAdapter {
    override fun readUnseen(): List<InboundEmail> {
        val config = emailSettingsService.getImapConfig()
        if (!config.enabled || config.imapHost.isBlank() || config.imapUser.isBlank()) return emptyList()
        return withFolder(config) { folder ->
            folder.search(FlagTerm(Flags(Flags.Flag.SEEN), false)).map(::toInboundEmail)
        }
    }

    override fun find(messageKey: String): InboundEmail? {
        val config = emailSettingsService.getImapConfig()
        if (!config.enabled || config.imapHost.isBlank() || config.imapUser.isBlank()) return null
        return withFolder(config) { folder ->
            val message = if (messageKey.startsWith("message-id:")) {
                val id = messageKey.removePrefix("message-id:")
                folder.search(HeaderTerm("Message-ID", id)).firstOrNull()
            } else {
                folder.messages.firstOrNull { ImapMessageKey.from(it) == messageKey }
            }
            message?.let(::toInboundEmail)
        }
    }

    override fun markSeen(messageKey: String) {
        val config = emailSettingsService.getImapConfig()
        if (!config.enabled || config.imapHost.isBlank() || config.imapUser.isBlank()) {
            throw IllegalStateException("IMAP ingestion is not configured")
        }
        withFolder(config) { folder ->
            val message = if (messageKey.startsWith("message-id:")) {
                val id = messageKey.removePrefix("message-id:")
                folder.search(HeaderTerm("Message-ID", id)).firstOrNull()
            } else {
                folder.messages.firstOrNull { ImapMessageKey.from(it) == messageKey }
            } ?: throw IllegalArgumentException("IMAP message not found: $messageKey")
            message.setFlag(Flags.Flag.SEEN, true)
            Unit
        }
    }

    private fun <T> withFolder(config: eu.nt.xpenses.services.ImapConfig, action: (Folder) -> T): T {
        val properties = Properties().apply {
            put("mail.imap.connectiontimeout", "10000")
            put("mail.imap.timeout", "10000")
            put("mail.imap.starttls.enable", "true")
            put("mail.imap.ssl.enable", (config.imapPort == 993).toString())
        }
        val session = Session.getInstance(properties)
        val protocol = if (config.imapPort == 993) "imaps" else "imap"
        var store: Store? = null
        var folder: Folder? = null
        try {
            store = session.getStore(protocol)
            store.connect(config.imapHost, config.imapPort, config.imapUser, config.imapPass)
            folder = store.getFolder(config.imapFolder)
            if (!folder.exists()) throw IllegalArgumentException("IMAP folder does not exist: ${config.imapFolder}")
            folder.open(Folder.READ_WRITE)
            return action(folder)
        } finally {
            try {
                folder?.close(false)
            } finally {
                store?.close()
            }
        }
    }

    private fun toInboundEmail(message: Message): InboundEmail {
        val fromAddress = message.from?.firstOrNull()?.toString()
        return InboundEmail(
            messageKey = ImapMessageKey.from(message),
            fromAddress = fromAddress,
            bodyText = getText(message),
            authenticationResults = message.getHeader("Authentication-Results")?.joinToString(" "),
            receivedSpf = message.getHeader("Received-SPF")?.joinToString(" ")
        )
    }

    private fun getText(message: Message): String = when {
        message.isMimeType("text/plain") -> message.content.toString()
        message.isMimeType("text/html") -> message.content.toString()
        message.isMimeType("multipart/*") -> getText(message.content as Multipart)
        else -> ""
    }

    private fun getText(multipart: Multipart): String = buildString {
        for (index in 0 until multipart.count) {
            val part = multipart.getBodyPart(index)
            when {
                part.isMimeType("text/plain") -> append(part.content.toString())
                part.isMimeType("text/html") -> append(part.content.toString())
                part.content is Multipart -> append(getText(part.content as Multipart))
            }
        }
    }
}
