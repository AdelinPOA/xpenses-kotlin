package eu.nt.xpenses.ingestion

import eu.nt.xpenses.services.EmailImportService
import org.springframework.stereotype.Component

@Component
class DelegationEmailParserAdapter(
    private val emailImportService: EmailImportService
) : DelegationEmailParser {
    override fun parse(email: InboundEmail): ParseResult {
        val outcome = emailImportService.parseDelegationEmailForIngestion(email.bodyText)
        val parsed = outcome.parsed
            ?: return if (outcome.transientAiFailure) {
                ParseResult.RetryableFailure("AI delegation parser temporarily unavailable")
            } else {
                ParseResult.Rejected("Delegation pattern not found")
            }
        val delegation = DelegationDraft.fromParsedValues(parsed)
            ?: return ParseResult.Rejected("Delegation title is missing")
        return ParseResult.Accepted(delegation)
    }
}
