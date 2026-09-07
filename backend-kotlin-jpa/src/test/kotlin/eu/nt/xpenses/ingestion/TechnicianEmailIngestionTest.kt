package eu.nt.xpenses.ingestion

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.services.ImapConfig
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.BDDMockito.given
import org.mockito.Mockito.doNothing
import org.mockito.Mockito.doThrow
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.test.context.TestPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean

@TestPropertySource(properties = ["spring.task.scheduling.enabled=false"])
class TechnicianEmailIngestionTest : IntegrationTestBase() {

    @Autowired
    private lateinit var ingestion: TechnicianEmailIngestion

    @BeforeEach
    fun enableImap() {
        given(emailSettingsService.getImapConfig()).willReturn(
            ImapConfig(enabled = true, imapHost = "imap.test", imapUser = "test-user")
        )
    }

    @MockitoBean
    private lateinit var mailbox: MailboxAdapter

    @MockitoBean
    private lateinit var parser: DelegationEmailParser

    @Test
    fun `valid email creates one report and acknowledges the mailbox`() {
        val message = inboundEmail()
        given(mailbox.readUnseen()).willReturn(listOf(message))
        given(parser.parse(message)).willReturn(ParseResult.Accepted(delegation()))
        val initialReportCount = expenseReportRepository.count()

        val result = ingestion.poll()

        assertEquals(1, result.processed)
        assertEquals(0, result.rejected)
        assertEquals(initialReportCount + 1, expenseReportRepository.count())
        verify(mailbox).markSeen(message.messageKey)

        val recovery = ingestion.listRecovery()
        val record = recovery.single { it.messageKey == message.messageKey }
        assertEquals(IngestionStatus.PROCESSED, record.status)
        assertNotNull(record.expenseReportId)
        assertEquals(AcknowledgementStatus.CONFIRMED, record.acknowledgementStatus)
    }

    @Test
    fun `failed mailbox acknowledgement retries without creating a second report`() {
        val message = inboundEmail("message-id:ack-retry")
        given(mailbox.readUnseen()).willReturn(listOf(message), emptyList())
        given(parser.parse(message)).willReturn(ParseResult.Accepted(delegation()))
        doThrow(IllegalStateException("mailbox unavailable"))
            .`when`(mailbox).markSeen(message.messageKey)
        val initialReportCount = expenseReportRepository.count()

        val first = ingestion.poll()
        assertEquals(1, first.processed)
        assertEquals(initialReportCount + 1, expenseReportRepository.count())

        doNothing().`when`(mailbox).markSeen(message.messageKey)
        given(mailbox.find(message.messageKey)).willReturn(message)

        val second = ingestion.retry(message.messageKey)

        assertTrue(second.acknowledged)
        assertEquals(initialReportCount + 1, expenseReportRepository.count())
    }

    @Test
    fun `transient parser failure remains retryable`() {
        val message = inboundEmail("message-id:transient")
        given(mailbox.readUnseen()).willReturn(listOf(message))
        given(parser.parse(message)).willReturn(ParseResult.RetryableFailure("provider timeout"))

        val result = ingestion.poll()

        assertEquals(1, result.failed)
        val record = ingestion.listRecovery().single { it.messageKey == message.messageKey }
        assertEquals(IngestionStatus.FAILED, record.status)
        assertNotNull(record.nextAttemptAt)
    }

    @Test
    fun `explicit sender authentication failure is rejected before parsing`() {
        val message = inboundEmail("message-id:auth-fail").copy(authenticationResults = "spf=fail dkim=pass")
        given(mailbox.readUnseen()).willReturn(listOf(message))

        val result = ingestion.poll()

        assertEquals(1, result.rejected)
        verify(mailbox).markSeen(message.messageKey)
        verifyNoInteractions(parser)
    }

    @Test
    fun `permanent parser rejection is acknowledged and is not automatically retried`() {
        val message = inboundEmail("message-id:rejected")
        given(mailbox.readUnseen()).willReturn(listOf(message))
        given(parser.parse(message)).willReturn(ParseResult.Rejected("delegation pattern not found"))

        val result = ingestion.poll()

        assertEquals(0, result.processed)
        assertEquals(1, result.rejected)
        verify(mailbox).markSeen(message.messageKey)
        assertEquals(IngestionStatus.REJECTED, ingestion.listRecovery().single().status)
    }

    private fun inboundEmail(key: String = "message-id:valid"): InboundEmail = InboundEmail(
        messageKey = key,
        fromAddress = "ion.popescu@nt-automation.eu",
        bodyText = "delegation",
        authenticationResults = "spf=pass dkim=pass",
        receivedSpf = "pass"
    )

    private fun delegation() = DelegationDraft(
        title = "Delegation from email",
        description = "Generated by test",
        dateFrom = "2026-09-10",
        dateTo = "2026-09-12"
    )
}
