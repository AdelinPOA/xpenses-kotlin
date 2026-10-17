package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.ingestion.DelegationDraft
import eu.nt.xpenses.ingestion.ImapIngestionLedger
import eu.nt.xpenses.ingestion.ProcessingClaim
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.UserRepository
import org.slf4j.LoggerFactory
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

@Service
class EmailImportService(
    private val userRepository: UserRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrService: OcrService,
    private val objectMapper: ObjectMapper,
    private val imapIngestionLedger: ImapIngestionLedger,
    private val parsingSettingsService: DelegationParsingSettingsService,
) {
    private val log = LoggerFactory.getLogger(EmailImportService::class.java)

    fun parseDateFlexible(dtStr: String): String? {
        val formats = listOf("dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "yyyy.MM.dd")
        for (fmt in formats) {
            try {
                val formatter = DateTimeFormatter.ofPattern(fmt)
                val date = LocalDate.parse(dtStr.trim(), formatter)
                return date.format(DateTimeFormatter.ISO_LOCAL_DATE)
            } catch (e: Exception) {
                log.debug("Failed to parse date: {}", dtStr)
                continue
            }
        }
        return null
    }

    fun parseDelegationEmailLocal(source: String): Map<String, String>? {
        val text = DelegationEmailText.normalize(source)
        val datePatterns =
            listOf(
                Pattern.compile("\\b\\d{2}\\.\\d{2}\\.\\d{4}\\b"),
                Pattern.compile("\\b\\d{4}-\\d{2}-\\d{2}\\b"),
                Pattern.compile("\\b\\d{2}/\\d{2}/\\d{4}\\b"),
                Pattern.compile("\\b\\d{2}-\\d{2}-\\d{4}\\b"),
                Pattern.compile("\\b\\d{4}\\.\\d{2}\\.\\d{2}\\b"),
            )
        val allDatesFound = mutableListOf<String>()
        for (pat in datePatterns) {
            val m = pat.matcher(text)
            while (m.find()) {
                val parsed = parseDateFlexible(m.group(0))
                if (parsed != null && !allDatesFound.contains(parsed)) {
                    allDatesFound.add(parsed)
                }
            }
        }

        val startKeywords = listOf("starttermin", "start date", "start", "begin", "from", "ab", "von", "inceput", "plecare", "din")
        val endKeywords = listOf("endtermin", "end date", "end", "to", "until", "bis", "sfarsit", "intoarcere", "pana")

        var dateFrom: String? = null
        var dateTo: String? = null

        val lines = text.split("\n")
        for (line in lines) {
            val lower = line.lowercase()
            var foundDateInLine: String? = null
            for (pat in datePatterns) {
                val m = pat.matcher(line)
                if (m.find()) {
                    foundDateInLine = parseDateFlexible(m.group(0))
                    if (foundDateInLine != null) break
                }
            }
            if (foundDateInLine != null) {
                if (startKeywords.any { lower.contains(it) }) {
                    dateFrom = foundDateInLine
                } else if (endKeywords.any { lower.contains(it) }) {
                    dateTo = foundDateInLine
                }
            }
        }

        if (dateFrom == null || dateTo == null) {
            val sortedDates = allDatesFound.sorted()
            if (sortedDates.size >= 2) {
                if (dateFrom == null) dateFrom = sortedDates.first()
                if (dateTo == null) dateTo = sortedDates.last()
            } else if (sortedDates.size == 1) {
                if (dateFrom == null) dateFrom = sortedDates.first()
                if (dateTo == null) dateTo = sortedDates.first()
            }
        }

        if (dateFrom == null || dateTo == null) {
            return null
        }

        // Helper: extract value after keyword on the same line
        fun extractAfterKeyword(
            lines: List<String>,
            keywords: List<String>,
        ): String? {
            val wordPat = Pattern.compile("^(\\S+)")
            for (kw in keywords) {
                val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
                for (line in lines) {
                    val m = pattern.matcher(line)
                    if (m.find()) {
                        val idx = m.start()
                        val valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                        if (valPart.isNotEmpty()) {
                            val wordMatch = wordPat.matcher(valPart)
                            if (wordMatch.find()) {
                                val word = wordMatch.group(1)
                                if (word.lowercase() !in
                                    setOf(
                                        "for",
                                        "the",
                                        "a",
                                        "of",
                                        "to",
                                        "in",
                                        "on",
                                        "job",
                                        "work",
                                        "is",
                                        "are",
                                        "with",
                                        "und",
                                        "der",
                                        "die",
                                        "das",
                                    )
                                ) {
                                    return valPart.replace(Regex("\\s+"), " ").trim()
                                }
                            }
                        }
                    }
                }
            }
            return null
        }

        fun extractMultiTokenAfterKeyword(
            lines: List<String>,
            keywords: List<String>,
        ): String? {
            val stopWords = setOf("for", "the", "a", "of", "to", "in", "on", "job", "work", "is", "are", "with", "und", "der", "die", "das")
            for (kw in keywords) {
                val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
                for (line in lines) {
                    val m = pattern.matcher(line)
                    if (m.find()) {
                        val idx = m.start()
                        var valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                        if (valPart.isNotEmpty()) {
                            // Remove leading code-like tokens that are likely not the value
                            val tokens = valPart.split(Regex("\\s+"))
                            val filtered = tokens.dropWhile { it.length <= 6 && it.any { c -> c.isDigit() } }
                            if (filtered.isNotEmpty()) {
                                valPart = filtered.joinToString(" ")
                            }
                            return valPart.replace(Regex("\\s+"), " ").trim()
                        }
                    }
                }
            }
            return null
        }

        // Extract multi-line address after Adresse keyword
        fun extractAddress(lines: List<String>): String? {
            val addrKws = listOf("adresse", "address", "adresă")
            val knownKwLines =
                setOf(
                    "telefon",
                    "telephone",
                    "phone",
                    "email",
                    "equipment",
                    "typbezeichnung",
                    "tech.",
                    "auftragsverantw",
                    "kundenauftrag",
                    "auftragsart",
                    "positionstyp",
                    "starttermin",
                    "endtermin",
                    "vorgang",
                    "arbeitsplatz",
                    "techniker",
                    "technplatz",
                    "kunde",
                    "adresse",
                    "address",
                    "adresă",
                    "start date",
                    "end date",
                    "start",
                    "end",
                    "from",
                    "to",
                    "customer",
                    "client",
                    "order",
                    "location",
                    "locatie",
                    "site",
                    "santier",
                    "ort",
                    "task",
                    "activitate",
                    "work",
                    "project",
                    "projekt",
                    "comanda",
                    "kundenauftrag",
                    "auftrag",
                    "kunde",
                )
            for (kw in addrKws) {
                val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
                for ((i, line) in lines.withIndex()) {
                    val m = pattern.matcher(line)
                    if (m.find()) {
                        val idx = m.start()
                        val firstLine = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                        val addrLines = mutableListOf<String>()
                        if (firstLine.isNotEmpty() && firstLine.length > 3) {
                            addrLines.add(firstLine)
                        }
                        // Collect subsequent non-blank, non-keyword lines
                        for (j in (i + 1) until lines.size) {
                            val nextLine = lines[j].trim()
                            if (nextLine.isEmpty()) break
                            val lowerNext = nextLine.lowercase()
                            if (knownKwLines.any { lowerNext.startsWith(it) }) break
                            addrLines.add(nextLine.replace(Regex("\\s+"), " "))
                        }
                        if (addrLines.isNotEmpty()) {
                            return addrLines.joinToString(", ")
                        }
                    }
                }
            }
            return null
        }

        val orderKws = listOf("kundenauftrag", "auftrag", "order", "comanda", "project", "projekt")
        val auftragsartKws = listOf("auftragsart", "order type", "tip comanda")
        val positionstypKws = listOf("positionstyp", "position", "task", "activitate", "work", "job type")
        val vorgangKws = listOf("vorgang", "process", "proces", "operation")
        val arbeitsplatzKws = listOf("arbeitsplatz", "workplace", "workstation", "loc de munca")
        val technikerKws = listOf("techniker", "technician", "tehnician")
        val technplatzKws = listOf("technplatz", "location", "ort", "locatie", "place", "site", "santier")
        val customerKws = listOf("kunde", "customer", "client", "beneficiar")

        val kundenauftrag = DelegationEmailText.orderNumber(text) ?: extractAfterKeyword(lines, orderKws)
        val auftragsart = extractAfterKeyword(lines, auftragsartKws)
        val positionstyp = extractMultiTokenAfterKeyword(lines, positionstypKws)
        val vorgang = extractAfterKeyword(lines, vorgangKws)
        val arbeitsplatz = extractMultiTokenAfterKeyword(lines, arbeitsplatzKws)
        val techniker = extractAfterKeyword(lines, technikerKws)
        val technplatzRaw = extractAfterKeyword(lines, technplatzKws)
        val customerRaw = extractAfterKeyword(lines, customerKws)
        val adresse = extractAddress(lines)

        // Split customer into code + name
        var kundeCode: String? = null
        var kundeName: String? = null
        if (customerRaw != null) {
            val codeMatch = Pattern.compile("^(\\d+)\\s+(\\S.*)").matcher(customerRaw.trim())
            if (codeMatch.find()) {
                kundeCode = codeMatch.group(1)
                kundeName = codeMatch.group(2).trim()
            } else {
                kundeName = customerRaw.trim()
            }
        }

        // Split TechnPlatz into raw value and line detection
        var technplatzLine = false
        var technplatzDisplay = technplatzRaw
        if (technplatzRaw != null) {
            val firstToken = technplatzRaw.trim().split(Regex("\\s+")).firstOrNull()
            if (firstToken != null && Pattern.matches("^C\\d{6,}", firstToken)) {
                technplatzLine = true
                technplatzDisplay = firstToken
            }
        }

        val finalCustomerName = kundeName ?: "Unknown Customer"
        val finalTechnplatz = technplatzDisplay ?: "Unknown Location"

        val title = "Delegation: $finalCustomerName ($finalTechnplatz)".take(200)

        // Build a clean description from structured fields
        val descParts = mutableListOf<String>()
        if (kundenauftrag != null) descParts.add("Order nr: $kundenauftrag")
        if (auftragsart != null) descParts.add("Order type: $auftragsart")
        if (positionstyp != null) descParts.add("Task: $positionstyp")
        if (vorgang != null) descParts.add("Operation: $vorgang")
        if (technplatzRaw != null) descParts.add("Technical location: $technplatzRaw")
        val description = descParts.joinToString("\n")

        return mapOf(
            "title" to title,
            "date_from" to dateFrom,
            "date_to" to dateTo,
            "description" to description,
            "kundenauftrag" to (kundenauftrag ?: ""),
            "auftragsart" to (auftragsart ?: ""),
            "positionstyp" to (positionstyp ?: ""),
            "technplatz_raw" to (technplatzRaw ?: ""),
            "technplatz_line" to technplatzLine.toString(),
            "kunde_code" to (kundeCode ?: ""),
            "kunde_name" to (kundeName ?: ""),
            "adresse" to (adresse ?: ""),
            "vorgang" to (vorgang ?: ""),
            "arbeitsplatz" to (arbeitsplatz ?: ""),
            "techniker" to (techniker ?: ""),
        )
    }

    fun parseDelegationEmailWithModels(
        text: String,
        config: OCRConfig,
        settings: DelegationParsingConfig = parsingSettingsService.getConfig(),
    ): Map<String, String>? {
        settings.validate()
        val normalizedText = DelegationEmailText.normalize(text)
        val json =
            ocrService.runModelChain(config, config.delegationModelChain, settings.systemPrompt(), normalizedText) { response ->
                parseDelegationModelResponse(response) != null
            } ?: return null
        val parsed = parseDelegationModelResponse(json) ?: return null
        val orderNumber = DelegationEmailText.orderNumber(normalizedText) ?: parsed["kundenauftrag"].orEmpty()
        if (orderNumber.isBlank()) return parsed
        val description = parsed.getValue("description")
        val orderPrefix =
            Regex("(?i)^(?:Order(?: nr\\.?| number| no\\.?)?|Kundenauftrag|Auftrag)\\s*:\\s*${Regex.escape(orderNumber)}[ \\t]*[;\\n]?\\s*")
        val details = description.replaceFirst(orderPrefix, "")
        return parsed +
            mapOf(
                "kundenauftrag" to orderNumber,
                "description" to listOf("Order nr: $orderNumber", details).filter { it.isNotBlank() }.joinToString("\n"),
            )
    }

    private fun parseDelegationModelResponse(response: String): Map<String, String>? =
        try {
            val result: Map<String, Any?> = objectMapper.readValue(response)
            val title = (result["title"] as? String)?.trim()?.takeIf { it.isNotEmpty() } ?: return null
            val description = result["description"] as? String ?: return null
            val dateFrom = result["date_from"] as? String
            val dateTo = result["date_to"] as? String
            if (dateFrom == null || dateTo == null ||
                !Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", dateFrom) ||
                !Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", dateTo)
            ) {
                return null
            }
            if (LocalDate.parse(dateTo).isBefore(LocalDate.parse(dateFrom))) return null
            mapOf(
                "title" to title.take(200),
                "date_from" to dateFrom,
                "date_to" to dateTo,
                "description" to description.trim(),
                "kundenauftrag" to (result["kundenauftrag"]?.toString() ?: ""),
                "auftragsart" to (result["auftragsart"]?.toString() ?: ""),
                "positionstyp" to (result["positionstyp"]?.toString() ?: ""),
                "technplatz_raw" to (result["technplatz_raw"]?.toString() ?: ""),
                "technplatz_line" to (result["technplatz_line"]?.toString() ?: "false"),
                "kunde_code" to (result["kunde_code"]?.toString() ?: ""),
                "kunde_name" to (result["kunde_name"]?.toString() ?: ""),
                "adresse" to (result["adresse"]?.toString() ?: ""),
                "vorgang" to (result["vorgang"]?.toString() ?: ""),
                "arbeitsplatz" to (result["arbeitsplatz"]?.toString() ?: ""),
                "techniker" to (result["techniker"]?.toString() ?: ""),
            )
        } catch (_: Exception) {
            null
        }

    fun parseDelegationEmailAsync(text: String): Map<String, String>? {
        val config = ocrService.getOcrConfig()
        if (config.ocrEnabled) {
            parseDelegationEmailWithModels(text, config)?.let { return it }
        }
        return parseDelegationEmailLocal(text)
    }

    @Transactional
    fun processIncomingEmail(
        fromAddress: String,
        bodyText: String,
    ): Boolean {
        var emailClean = fromAddress.trim()
        if (emailClean.contains("<") && emailClean.contains(">")) {
            emailClean = emailClean.substringAfter("<").substringBefore(">").trim()
        }

        val user = userRepository.findByEmail(emailClean)
        if (user == null) {
            log.info("Email import skipped: no user found with email {}", emailClean)
            return false
        }
        if (!user.isActive) {
            log.info("Email import skipped: user {} is inactive", emailClean)
            return false
        }

        val parsed = parseDelegationEmailAsync(bodyText) ?: return false
        val delegation = DelegationDraft.fromParsedValues(parsed) ?: return false
        return createReport(fromAddress, delegation) != null
    }

    @Transactional
    fun createReportAndComplete(
        claim: ProcessingClaim,
        fromAddress: String,
        delegation: DelegationDraft,
    ): Int? {
        val report = createReport(fromAddress, delegation) ?: return null
        val reportId = requireNotNull(report.id)
        imapIngestionLedger.markProcessed(claim, reportId)
        return reportId
    }

    fun hasActiveSender(fromAddress: String): Boolean = findActiveSender(fromAddress) != null

    fun createReport(
        fromAddress: String,
        delegation: DelegationDraft,
    ): ExpenseReport? {
        val user = findActiveSender(fromAddress) ?: return null

        val report =
            ExpenseReport(
                title = delegation.title,
                description = delegation.description,
                dateFrom = delegation.dateFrom,
                dateTo = delegation.dateTo,
                status = "draft",
                user = user,
                kundenauftrag = delegation.kundenauftrag,
                auftragsart = delegation.auftragsart,
                positionstyp = delegation.positionstyp,
                technplatzRaw = delegation.technplatzRaw,
                technplatzLine = delegation.technplatzLine,
                kundeCode = delegation.kundeCode,
                kundeName = delegation.kundeName,
                adresse = delegation.adresse,
                vorgang = delegation.vorgang,
                arbeitsplatz = delegation.arbeitsplatz,
                techniker = delegation.techniker,
                createdAt = Instant.now(),
                updatedAt = Instant.now(),
            )
        return expenseReportRepository.save(report)
    }

    private fun findActiveSender(fromAddress: String): eu.nt.xpenses.model.User? {
        var emailClean = fromAddress.trim()
        if (emailClean.contains("<") && emailClean.contains(">")) {
            emailClean = emailClean.substringAfter("<").substringBefore(">").trim()
        }
        val user = userRepository.findByEmail(emailClean)
        if (user == null) {
            log.info("Email import skipped: no user found with email {}", emailClean)
            return null
        }
        if (!user.isActive || user.role != "technician") {
            log.info("Email import skipped: sender is inactive or not a Technician: {}", emailClean)
            return null
        }
        return user
    }

    @Transactional
    fun simulateIncomingEmail(
        fromAddress: String,
        bodyText: String,
        requestedParser: String? = null,
    ): Map<String, Any?> {
        var emailClean = fromAddress.trim()
        if (emailClean.contains("<") && emailClean.contains(">")) {
            emailClean = emailClean.substringAfter("<").substringBefore(">").trim()
        }

        val user = userRepository.findByEmail(emailClean)
        if (user == null) {
            return mapOf(
                "success" to false,
                "error" to "No user found with email '$emailClean'",
                "parsed" to null,
            )
        }
        if (!user.isActive) {
            return mapOf(
                "success" to false,
                "error" to "User '${user.displayName}' ($emailClean) is inactive",
                "parsed" to null,
            )
        }

        val localParsed = parseDelegationEmailLocal(bodyText)
        val config = ocrService.getOcrConfig()
        val modelParsed =
            if (config.ocrEnabled) {
                parseDelegationEmailWithModels(bodyText, config)
            } else {
                null
            }
        val modelError = if (modelParsed == null) "No configured AI model returned a valid delegation result" else null
        val useAi =
            if (requestedParser != null) {
                requestedParser in setOf("ai", "gemini") && modelParsed != null
            } else {
                config.ocrEnabled && modelParsed != null
            }
        val finalParsed = if (useAi) modelParsed else localParsed

        if (finalParsed == null) {
            return mapOf(
                "success" to false,
                "error" to "Could not parse delegation patterns in email body with active provider",
                "parsed" to null,
                "local_parsed" to localParsed,
                "ai_parsed" to modelParsed,
                "ai_error" to modelError,
                "gemini_parsed" to modelParsed,
                "gemini_error" to modelError,
                "active_parser" to if (useAi) "ai" else "local",
            )
        }

        val report =
            ExpenseReport(
                title = finalParsed["title"]!!,
                description = finalParsed["description"],
                dateFrom = finalParsed["date_from"],
                dateTo = finalParsed["date_to"],
                status = "draft",
                user = user,
                kundenauftrag = finalParsed["kundenauftrag"]?.ifEmpty { null },
                auftragsart = finalParsed["auftragsart"]?.ifEmpty { null },
                positionstyp = finalParsed["positionstyp"]?.ifEmpty { null },
                technplatzRaw = finalParsed["technplatz_raw"]?.ifEmpty { null },
                technplatzLine = finalParsed["technplatz_line"]?.toBoolean() ?: false,
                kundeCode = finalParsed["kunde_code"]?.ifEmpty { null },
                kundeName = finalParsed["kunde_name"]?.ifEmpty { null },
                adresse = finalParsed["adresse"]?.ifEmpty { null },
                vorgang = finalParsed["vorgang"]?.ifEmpty { null },
                arbeitsplatz = finalParsed["arbeitsplatz"]?.ifEmpty { null },
                techniker = finalParsed["techniker"]?.ifEmpty { null },
                createdAt = Instant.now(),
                updatedAt = Instant.now(),
            )
        val savedReport = expenseReportRepository.save(report)

        return mapOf(
            "success" to true,
            "report_id" to savedReport.id,
            "parsed" to finalParsed,
            "local_parsed" to localParsed,
            "ai_parsed" to modelParsed,
            "ai_error" to modelError,
            "gemini_parsed" to modelParsed,
            "gemini_error" to modelError,
            "active_parser" to if (useAi) "ai" else "local",
            "user_display_name" to user.displayName,
        )
    }
}
