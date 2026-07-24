package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.UserRepository
import jakarta.mail.*
import jakarta.mail.search.FlagTerm
import org.slf4j.LoggerFactory
import org.springframework.http.MediaType
import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import org.springframework.http.client.JdkClientHttpRequestFactory
import java.net.http.HttpClient
import java.time.Duration
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
    private val emailSettingsService: EmailSettingsService
) {
    private val log = LoggerFactory.getLogger(EmailImportService::class.java)
    private val restClient = RestClient.builder()
        .requestFactory(JdkClientHttpRequestFactory(HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build()
        ).also { it.setReadTimeout(Duration.ofSeconds(60)) })
        .build()

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

    fun parseDelegationEmailLocal(text: String): Map<String, String>? {
        val datePatterns = listOf(
            Pattern.compile("\\b\\d{2}\\.\\d{2}\\.\\d{4}\\b"),
            Pattern.compile("\\b\\d{4}-\\d{2}-\\d{2}\\b"),
            Pattern.compile("\\b\\d{2}/\\d{2}/\\d{4}\\b"),
            Pattern.compile("\\b\\d{2}-\\d{2}-\\d{4}\\b"),
            Pattern.compile("\\b\\d{4}\\.\\d{2}\\.\\d{2}\\b")
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
        fun extractAfterKeyword(lines: List<String>, keywords: List<String>): String? {
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
                                if (word.lowercase() !in setOf("for", "the", "a", "of", "to", "in", "on", "job", "work", "is", "are", "with", "und", "der", "die", "das")) {
                                    return valPart.replace(Regex("\\s+"), " ").trim()
                                }
                            }
                        }
                    }
                }
            }
            return null
        }

        fun extractMultiTokenAfterKeyword(lines: List<String>, keywords: List<String>): String? {
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
            val knownKwLines = setOf(
                "kundenauftrag", "auftragsart", "positionstyp", "starttermin", "endtermin",
                "vorgang", "arbeitsplatz", "techniker", "technplatz", "kunde", "adresse",
                "address", "adresă", "start date", "end date", "start", "end", "from", "to",
                "customer", "client", "order", "location", "locatie", "site", "santier", "ort",
                "task", "activitate", "work", "project", "projekt", "comanda",
                "kundenauftrag", "auftrag", "kunde"
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
                            addrLines.add(nextLine)
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

        val kundenauftrag = extractAfterKeyword(lines, orderKws)
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
        if (kundenauftrag != null) descParts.add("Order: $kundenauftrag")
        if (auftragsart != null) descParts.add("Type: $auftragsart")
        if (positionstyp != null) descParts.add("Task: $positionstyp")
        if (vorgang != null) descParts.add("Process: $vorgang")
        if (technplatzRaw != null) descParts.add("Location: $technplatzRaw")
        val description = descParts.joinToString("; ")

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
            "techniker" to (techniker ?: "")
        )
    }

    fun parseDelegationEmailGemini(text: String, apiKey: String, provider: String = "gemini"): Map<String, String>? {
        val modelName = ocrService.geminiModelName(provider)
        val url = "https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent"
        val payload = mapOf(
            "contents" to listOf(
                mapOf(
                    "parts" to listOf(
                        mapOf(
                            "text" to (
                                "Analyze this email body and extract structured details about a professional delegation or business trip. " +
                                "Extract the following fields and return them in the requested JSON structure: " +
                                "title (a concise summary like 'Delegation: [Customer] ([Location])', max 200 characters), " +
                                "date_from (start date in YYYY-MM-DD format), " +
                                "date_to (end date in YYYY-MM-DD format), " +
                                "description (a brief, human-friendly summary of key details), " +
                                "kundenauftrag (customer order number, e.g. '0007038319'), " +
                                "auftragsart (order type code, e.g. 'KR20'), " +
                                "positionstyp (task/position type, e.g. 'Mechanical full installation'), " +
                                "technplatz_raw (full TechnPlatz value from the email), " +
                                "technplatz_line (boolean: true if technplatz_raw starts with 'C' followed by 6+ digits), " +
                                "kunde_code (numeric customer code, e.g. '0022265695'), " +
                                "kunde_name (customer name without the code), " +
                                "adresse (full address), " +
                                "vorgang (process number), " +
                                "arbeitsplatz (workplace info), " +
                                "techniker (technician name)."
                            )
                        ),
                        mapOf(
                            "text" to text
                        )
                    )
                )
            ),
            "generationConfig" to mapOf(
                "responseMimeType" to "application/json",
                "responseSchema" to mapOf(
                    "type" to "OBJECT",
                    "properties" to mapOf(
                        "title" to mapOf("type" to "STRING"),
                        "date_from" to mapOf("type" to "STRING"),
                        "date_to" to mapOf("type" to "STRING"),
                        "description" to mapOf("type" to "STRING"),
                        "kundenauftrag" to mapOf("type" to "STRING"),
                        "auftragsart" to mapOf("type" to "STRING"),
                        "positionstyp" to mapOf("type" to "STRING"),
                        "technplatz_raw" to mapOf("type" to "STRING"),
                        "technplatz_line" to mapOf("type" to "BOOLEAN"),
                        "kunde_code" to mapOf("type" to "STRING"),
                        "kunde_name" to mapOf("type" to "STRING"),
                        "adresse" to mapOf("type" to "STRING"),
                        "vorgang" to mapOf("type" to "STRING"),
                        "arbeitsplatz" to mapOf("type" to "STRING"),
                        "techniker" to mapOf("type" to "STRING")
                    ),
                    "required" to listOf("title", "date_from", "date_to", "description")
                )
            )
        )

        return try {
            val response = restClient.post()
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
                .header("x-goog-api-key", apiKey)
                .body(payload)
                .retrieve()
                .body<Map<String, Any>>() ?: throw Exception("Empty response from Gemini")

            val candidates = response["candidates"] as? List<*> ?: emptyList<Any>()
            val candidate = candidates.firstOrNull() as? Map<*, *>
            val content = candidate?.get("content") as? Map<*, *>
            val parts = content?.get("parts") as? List<*>
            val firstPart = parts?.firstOrNull() as? Map<*, *>
            val textResponse = firstPart?.get("text")?.toString() ?: "{}"

            val result: Map<String, Any?> = objectMapper.readValue(textResponse)
            
            var dateFrom = result["date_from"] as? String
            var dateTo = result["date_to"] as? String

            if (dateFrom != null && !Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", dateFrom)) {
                dateFrom = null
            }
            if (dateTo != null && !Pattern.matches("^\\d{4}-\\d{2}-\\d{2}$", dateTo)) {
                dateTo = null
            }

            if (dateFrom == null || dateTo == null) {
                return null
            }

            mapOf(
                "title" to (result["title"]?.toString() ?: "Delegation Report").take(200),
                "date_from" to dateFrom,
                "date_to" to dateTo,
                "description" to (result["description"]?.toString() ?: "").trim(),
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
                "techniker" to (result["techniker"]?.toString() ?: "")
            )
        } catch (e: Exception) {
            log.warn("Gemini email parsing failed: {}", e.message)
            null
        }
    }

    fun parseDelegationEmailAsync(text: String): Map<String, String>? {
        val ocrCfg = ocrService.getOcrConfig()
        if (ocrCfg.ocrEnabled && (ocrCfg.provider == "gemini" || ocrCfg.provider.startsWith("gemini-")) && ocrCfg.geminiApiKey.isNotEmpty()) {
            val parsed = parseDelegationEmailGemini(text, ocrCfg.geminiApiKey, ocrCfg.provider)
            if (parsed != null) return parsed
        }
        return parseDelegationEmailLocal(text)
    }

    @Transactional
    fun processIncomingEmail(fromAddress: String, bodyText: String): Boolean {
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

        val report = ExpenseReport(
            title = parsed["title"]!!,
            description = parsed["description"],
            dateFrom = parsed["date_from"],
            dateTo = parsed["date_to"],
            status = "draft",
            user = user,
            kundenauftrag = parsed["kundenauftrag"]?.ifEmpty { null },
            auftragsart = parsed["auftragsart"]?.ifEmpty { null },
            positionstyp = parsed["positionstyp"]?.ifEmpty { null },
            technplatzRaw = parsed["technplatz_raw"]?.ifEmpty { null },
            technplatzLine = parsed["technplatz_line"]?.toBoolean() ?: false,
            kundeCode = parsed["kunde_code"]?.ifEmpty { null },
            kundeName = parsed["kunde_name"]?.ifEmpty { null },
            adresse = parsed["adresse"]?.ifEmpty { null },
            vorgang = parsed["vorgang"]?.ifEmpty { null },
            arbeitsplatz = parsed["arbeitsplatz"]?.ifEmpty { null },
            techniker = parsed["techniker"]?.ifEmpty { null },
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )
        expenseReportRepository.save(report)
        return true
    }

    @Transactional
    fun simulateIncomingEmail(fromAddress: String, bodyText: String, requestedParser: String? = null): Map<String, Any?> {
        var emailClean = fromAddress.trim()
        if (emailClean.contains("<") && emailClean.contains(">")) {
            emailClean = emailClean.substringAfter("<").substringBefore(">").trim()
        }

        val user = userRepository.findByEmail(emailClean)
        if (user == null) {
            return mapOf(
                "success" to false,
                "error" to "No user found with email '$emailClean'",
                "parsed" to null
            )
        }
        if (!user.isActive) {
            return mapOf(
                "success" to false,
                "error" to "User '${user.displayName}' ($emailClean) is inactive",
                "parsed" to null
            )
        }

        val localParsed = parseDelegationEmailLocal(bodyText)
        
        var geminiParsed: Map<String, String>? = null
        var geminiError: String? = null
        try {
            val ocrCfg = ocrService.getOcrConfig()
            if (ocrCfg.ocrEnabled && ocrCfg.geminiApiKey.isNotEmpty()) {
                geminiParsed = parseDelegationEmailGemini(bodyText, ocrCfg.geminiApiKey, ocrCfg.provider)
            } else {
                geminiError = "Gemini key not configured or OCR disabled in settings"
            }
        } catch (e: Exception) {
            geminiError = e.message ?: e.toString()
        }

        val ocrCfg = ocrService.getOcrConfig()
        val isGeminiProvider = ocrCfg.provider == "gemini" || ocrCfg.provider.startsWith("gemini-")
        
        val useGemini = if (requestedParser != null) {
            requestedParser == "gemini" && geminiParsed != null
        } else {
            ocrCfg.ocrEnabled && isGeminiProvider && geminiParsed != null
        }
        
        val finalParsed = if (useGemini) geminiParsed else localParsed

        if (finalParsed == null) {
            return mapOf(
                "success" to false,
                "error" to "Could not parse delegation patterns in email body with active provider",
                "parsed" to null,
                "local_parsed" to localParsed,
                "gemini_parsed" to geminiParsed,
                "gemini_error" to geminiError,
                "active_parser" to if (useGemini) "gemini" else "local"
            )
        }

        val report = ExpenseReport(
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
            updatedAt = Instant.now()
        )
        val savedReport = expenseReportRepository.save(report)

        return mapOf(
            "success" to true,
            "report_id" to savedReport.id,
            "parsed" to finalParsed,
            "local_parsed" to localParsed,
            "gemini_parsed" to geminiParsed,
            "gemini_error" to geminiError,
            "active_parser" to if (useGemini) "gemini" else "local",
            "user_display_name" to user.displayName
        )
    }

    @Async
    @Scheduled(fixedDelayString = "\${imap.poll-interval:300000}")
    fun pollAndProcessEmails() {
        val config = emailSettingsService.getImapConfig()
        if (!config.enabled || config.imapHost.isBlank() || config.imapUser.isBlank()) {
            return
        }
        log.info("Starting scheduled IMAP polling on host: {}, user: {}", config.imapHost, config.imapUser)

        var store: Store? = null
        var folder: Folder? = null
        try {
            val props = java.util.Properties().apply {
                put("mail.imap.connectiontimeout", "10000")
                put("mail.imap.timeout", "10000")
                put("mail.imap.starttls.enable", "true")
                put("mail.imap.ssl.enable", (config.imapPort == 993).toString())
            }
            val session = Session.getInstance(props)
            val protocol = if (config.imapPort == 993) "imaps" else "imap"
            store = session.getStore(protocol)
            store.connect(config.imapHost, config.imapPort, config.imapUser, config.imapPass)

            folder = store.getFolder(config.imapFolder)
            if (!folder.exists()) {
                log.warn("IMAP folder '{}' does not exist", config.imapFolder)
                return
            }
            folder.open(Folder.READ_WRITE)

            val unseenTerm = FlagTerm(Flags(Flags.Flag.SEEN), false)
            val messages = folder.search(unseenTerm)
            log.info("Found {} unseen emails to process", messages.size)

            for (message in messages) {
                try {
                    val fromAddresses = message.from
                    val fromAddress = fromAddresses?.firstOrNull()?.toString() ?: continue
                    val bodyText = getTextFromMessage(message)

                    log.info("Processing email from: {}", fromAddress)
                    val processed = processIncomingEmail(fromAddress, bodyText)
                    if (processed) {
                        log.info("Successfully processed email from {}", fromAddress)
                        message.setFlag(Flags.Flag.SEEN, true)
                    } else {
                        log.info("Email from {} was not processed (e.g. user not found or no delegation patterns)", fromAddress)
                    }
                } catch (e: Exception) {
                    log.error("Failed to process message: {}", e.message, e)
                }
            }
        } catch (e: Exception) {
            log.error("Error during IMAP polling: {}", e.message)
        } finally {
            try {
                folder?.close(true)
            } catch (e: Exception) {
                // ignore
            }
            try {
                store?.close()
            } catch (e: Exception) {
                // ignore
            }
        }
    }

    private fun getTextFromMessage(message: Message): String {
        return when {
            message.isMimeType("text/plain") -> message.content.toString()
            message.isMimeType("text/html") -> message.content.toString()
            message.isMimeType("multipart/*") -> {
                val mimeMultipart = message.content as Multipart
                getTextFromMimeMultipart(mimeMultipart)
            }
            else -> ""
        }
    }

    private fun getTextFromMimeMultipart(mimeMultipart: Multipart): String {
        val result = StringBuilder()
        val count = mimeMultipart.count
        for (i in 0 until count) {
            val bodyPart = mimeMultipart.getBodyPart(i)
            when {
                bodyPart.isMimeType("text/plain") -> {
                    result.append(bodyPart.content.toString())
                }
                bodyPart.isMimeType("text/html") -> {
                    result.append(bodyPart.content.toString())
                }
                bodyPart.content is Multipart -> {
                    result.append(getTextFromMimeMultipart(bodyPart.content as Multipart))
                }
            }
        }
        return result.toString()
    }
}
