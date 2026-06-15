package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import jakarta.mail.Message
import jakarta.mail.Session
import jakarta.mail.Transport
import jakarta.mail.internet.InternetAddress
import jakarta.mail.internet.MimeMessage
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import java.time.Instant
import java.util.*

data class EmailConfig(
    @JsonProperty("emails_enabled") var emailsEnabled: Boolean = false,
    @JsonProperty("smtp_host") var smtpHost: String = "",
    @JsonProperty("smtp_port") var smtpPort: Int = 587,
    @JsonProperty("smtp_user") var smtpUser: String = "",
    @JsonProperty("smtp_pass") var smtpPass: String = "",
    @JsonProperty("smtp_from") var smtpFrom: String = "",
    @JsonProperty("password_set") var passwordSet: Boolean = false
)

data class ImapConfig(
    var enabled: Boolean = false,
    @JsonProperty("imap_host") var imapHost: String = "",
    @JsonProperty("imap_port") var imapPort: Int = 993,
    @JsonProperty("imap_user") var imapUser: String = "",
    @JsonProperty("imap_pass") var imapPass: String = "",
    @JsonProperty("imap_folder") var imapFolder: String = "INBOX",
    @JsonProperty("password_set") var passwordSet: Boolean = false
)

@Service
class EmailSettingsService(
    private val appSettingRepository: AppSettingRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper
) {
    private val smtpCryptoInfo = "xpenses-smtp-pw"
    private val imapCryptoInfo = "xpenses-imap-pw"

    fun getSmtpConfig(): EmailConfig {
        val setting = appSettingRepository.findById("email_config").orElse(null)
            ?: return EmailConfig()
        
        return try {
            val config: EmailConfig = objectMapper.readValue(setting.value)
            val encryptedPw = config.smtpPass
            if (encryptedPw.isNotEmpty()) {
                try {
                    config.smtpPass = cryptoService.decrypt(encryptedPw, smtpCryptoInfo)
                    config.passwordSet = true
                } catch (e: Exception) {
                    config.smtpPass = ""
                    config.passwordSet = false
                }
            }
            config
        } catch (e: Exception) {
            EmailConfig()
        }
    }

    fun saveSmtpConfig(config: EmailConfig) {
        val encryptedPw = if (config.smtpPass.isNotEmpty()) {
            cryptoService.encrypt(config.smtpPass, smtpCryptoInfo)
        } else {
            ""
        }
        val configToSave = config.copy(smtpPass = encryptedPw)
        val jsonValue = objectMapper.writeValueAsString(configToSave)
        
        val setting = AppSetting(
            key = "email_config",
            value = jsonValue,
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)
    }

    fun testSmtpConnection(config: EmailConfig, toEmail: String): Map<String, Any> {
        val props = Properties().apply {
            put("mail.smtp.host", config.smtpHost)
            put("mail.smtp.port", config.smtpPort.toString())
            put("mail.smtp.auth", if (config.smtpUser.isNotEmpty()) "true" else "false")
            if (config.smtpPort == 587) {
                put("mail.smtp.starttls.enable", "true")
            } else if (config.smtpPort == 465) {
                put("mail.smtp.socketFactory.port", "465")
                put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory")
            }
            put("mail.smtp.connectiontimeout", "5000")
            put("mail.smtp.timeout", "5000")
        }

        val session = Session.getInstance(props)
        return try {
            val message = MimeMessage(session).apply {
                setFrom(InternetAddress(config.smtpFrom))
                setRecipient(Message.RecipientType.TO, InternetAddress(toEmail))
                subject = "Xpenses SMTP Test Connection"
                setText("This is a test email from Xpenses to verify SMTP configuration.")
            }

            if (config.smtpUser.isNotEmpty()) {
                val transport = session.getTransport("smtp")
                transport.connect(config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass)
                transport.sendMessage(message, message.allRecipients)
                transport.close()
            } else {
                Transport.send(message)
            }
            mapOf("success" to true, "message" to "Test email sent to $toEmail")
        } catch (e: Exception) {
            mapOf("success" to false, "message" to (e.message ?: e.toString()))
        }
    }

    fun getImapConfig(): ImapConfig {
        val setting = appSettingRepository.findById("imap_config").orElse(null)
            ?: return ImapConfig()
        
        return try {
            val config: ImapConfig = objectMapper.readValue(setting.value)
            val encryptedPw = config.imapPass
            if (encryptedPw.isNotEmpty()) {
                try {
                    config.imapPass = cryptoService.decrypt(encryptedPw, imapCryptoInfo)
                    config.passwordSet = true
                } catch (e: Exception) {
                    config.imapPass = ""
                    config.passwordSet = false
                }
            }
            config
        } catch (e: Exception) {
            ImapConfig()
        }
    }

    fun saveImapConfig(config: ImapConfig) {
        val encryptedPw = if (config.imapPass.isNotEmpty()) {
            cryptoService.encrypt(config.imapPass, imapCryptoInfo)
        } else {
            ""
        }
        val configToSave = config.copy(imapPass = encryptedPw)
        val jsonValue = objectMapper.writeValueAsString(configToSave)
        
        val setting = AppSetting(
            key = "imap_config",
            value = jsonValue,
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)
    }

    fun testImapConnection(config: ImapConfig): Map<String, Any> {
        val props = Properties().apply {
            put("mail.imap.connectiontimeout", "5000")
            put("mail.imap.timeout", "5000")
        }
        val session = Session.getInstance(props)
        return try {
            val protocol = if (config.imapPort == 993) "imaps" else "imap"
            val store = session.getStore(protocol)
            store.connect(config.imapHost, config.imapPort, config.imapUser, config.imapPass)
            val folder = store.getFolder(config.imapFolder)
            folder.open(jakarta.mail.Folder.READ_ONLY)
            folder.close(false)
            store.close()
            mapOf("success" to true, "message" to "Successfully connected and selected folder.")
        } catch (e: Exception) {
            mapOf("success" to false, "message" to (e.message ?: e.toString()))
        }
    }

    @Async
    fun sendEmail(toEmail: String, subject: String, content: String) {
        val config = getSmtpConfig()
        if (!config.emailsEnabled) {
            println("Email disabled. Would have sent to $toEmail: $subject")
            return
        }

        val props = Properties().apply {
            put("mail.smtp.host", config.smtpHost)
            put("mail.smtp.port", config.smtpPort.toString())
            put("mail.smtp.auth", if (config.smtpUser.isNotEmpty()) "true" else "false")
            if (config.smtpPort == 587) {
                put("mail.smtp.starttls.enable", "true")
            } else if (config.smtpPort == 465) {
                put("mail.smtp.socketFactory.port", "465")
                put("mail.smtp.socketFactory.class", "javax.net.ssl.SSLSocketFactory")
            }
            put("mail.smtp.connectiontimeout", "5000")
            put("mail.smtp.timeout", "5000")
        }

        val session = Session.getInstance(props)
        try {
            val message = MimeMessage(session).apply {
                setFrom(InternetAddress(config.smtpFrom))
                setRecipient(Message.RecipientType.TO, InternetAddress(toEmail))
                this.subject = subject
                setText(content)
            }

            if (config.smtpUser.isNotEmpty()) {
                val transport = session.getTransport("smtp")
                transport.connect(config.smtpHost, config.smtpPort, config.smtpUser, config.smtpPass)
                transport.sendMessage(message, message.allRecipients)
                transport.close()
            } else {
                Transport.send(message)
            }
            println("Email successfully sent to $toEmail: $subject")
        } catch (e: Exception) {
            System.err.println("Failed to send email to $toEmail: ${e.message}")
        }
    }
}

