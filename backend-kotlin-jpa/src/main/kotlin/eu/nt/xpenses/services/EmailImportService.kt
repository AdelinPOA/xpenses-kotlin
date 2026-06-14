package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.ExpenseReport
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.UserRepository
import org.springframework.http.MediaType
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import java.time.Instant
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.util.regex.Pattern

@Service
class EmailImportService(
    private val userRepository: UserRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val ocrService: OcrService,
    private val objectMapper: ObjectMapper
) {
    private val restClient = RestClient.builder().build()

    fun parseDateFlexible(dtStr: String): String? {
        val formats = listOf("dd.MM.yyyy", "dd/MM/yyyy", "yyyy-MM-dd", "dd-MM-yyyy", "yyyy.MM.dd")
        for (fmt in formats) {
            try {
                val formatter = DateTimeFormatter.ofPattern(fmt)
                val date = LocalDate.parse(dtStr.trim(), formatter)
                return date.format(DateTimeFormatter.ISO_LOCAL_DATE)
            } catch (e: Exception) {
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

        var customer: String? = null
        var location: String? = null
        var order: String? = null
        var task: String? = null

        val customerKws = listOf("kunde", "customer", "client", "beneficiar")
        val locationKws = listOf("technplatz", "location", "ort", "locatie", "place", "site", "santier")
        val orderKws = listOf("kundenauftrag", "auftrag", "order", "comanda", "project", "projekt")
        val taskKws = listOf("positionstyp", "task", "position", "activitate", "work")

        // Extract Order
        for (kw in orderKws) {
            val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
            for (line in lines) {
                val m = pattern.matcher(line)
                if (m.find()) {
                    val idx = m.start()
                    val valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                    if (valPart.isNotEmpty()) {
                        val codeMatch = Pattern.compile("^(\\w+)").matcher(valPart)
                        if (codeMatch.find()) {
                            val code = codeMatch.group(1)
                            if (code.lowercase() !in setOf("for", "the", "a", "of", "to", "in", "on", "job", "work", "is", "are", "with")) {
                                order = code
                                break
                            }
                        }
                    }
                }
            }
            if (order != null) break
        }

        // Extract Customer
        for (kw in customerKws) {
            val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
            for (line in lines) {
                val m = pattern.matcher(line)
                if (m.find()) {
                    val idx = m.start()
                    val valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                    if (valPart.isNotEmpty()) {
                        val cleanedVal = valPart.replace(Regex("^\\d+\\s+"), "")
                        if (cleanedVal.isNotEmpty()) {
                            customer = cleanedVal
                            break
                        }
                    }
                }
            }
            if (customer != null) break
        }

        // Extract Location
        for (kw in locationKws) {
            val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
            for (line in lines) {
                val m = pattern.matcher(line)
                if (m.find()) {
                    val idx = m.start()
                    val valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                    if (valPart.isNotEmpty()) {
                        val cleanedVal = valPart.replace(Regex("^[A-Z]\\d+\\s+"), "")
                        if (cleanedVal.isNotEmpty()) {
                            location = cleanedVal
                            break
                        }
                    }
                }
            }
            if (location != null) break
        }

        // Extract Task
        for (kw in taskKws) {
            val pattern = Pattern.compile("\\b${Pattern.quote(kw)}\\b", Pattern.CASE_INSENSITIVE)
            for (line in lines) {
                val m = pattern.matcher(line)
                if (m.find()) {
                    val idx = m.start()
                    val valPart = line.substring(idx + kw.length).trim().replace(Regex("^[:\\s\\t\\-]+"), "")
                    if (valPart.isNotEmpty()) {
                        val codeMatch = Pattern.compile("^(\\w+)").matcher(valPart)
                        if (codeMatch.find() && codeMatch.group(1).lowercase() !in setOf("for", "on", "in", "to", "with", "the", "a")) {
                            task = valPart
                            break
                        }
                    }
                }
            }
            if (task != null) break
        }

        val finalCustomer = customer?.trim()?.replace(Regex("\\s+"), " ") ?: "Unknown Customer"
        val finalLocation = location?.trim()?.replace(Regex("\\s+"), " ") ?: "Unknown Location"
        val finalOrder = order?.trim() ?: "Unknown Order"
        val finalTask = task?.trim()?.replace(Regex("\\s+"), " ") ?: "Installation"

        val title = "Delegation: $finalCustomer ($finalLocation)"
        val description = "Kundenauftrag: $finalOrder\nLocation: $finalLocation\nTask: $finalTask"

        return mapOf(
            "title" to title.take(200),
            "date_from" to dateFrom!!,
            "date_to" to dateTo!!,
            "description" to description
        )
    }

    fun parseDelegationEmailGemini(text: String, apiKey: String): Map<String, String>? {
        val url = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=$apiKey"
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
                                "and description (a brief, human-friendly summary of key details, such as order number, location, and tasks)."
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
                        "description" to mapOf("type" to "STRING")
                    ),
                    "required" to listOf("title", "date_from", "date_to", "description")
                )
            )
        )

        return try {
            val response = restClient.post()
                .uri(url)
                .contentType(MediaType.APPLICATION_JSON)
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
                "description" to (result["description"]?.toString() ?: "").trim()
            )
        } catch (e: Exception) {
            println("Gemini email parsing failed: ${e.message}")
            null
        }
    }

    fun parseDelegationEmailAsync(text: String): Map<String, String>? {
        val ocrCfg = ocrService.getOcrConfig()
        if (ocrCfg.ocrEnabled && ocrCfg.provider == "gemini" && ocrCfg.geminiApiKey.isNotEmpty()) {
            val parsed = parseDelegationEmailGemini(text, ocrCfg.geminiApiKey)
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

        val user = userRepository.findAll().firstOrNull { it.email?.lowercase() == emailClean.lowercase() }
        if (user == null) {
            println("Email import skipped: no user found with email $emailClean")
            return false
        }
        if (!user.isActive) {
            println("Email import skipped: user $emailClean is inactive")
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
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )
        expenseReportRepository.save(report)
        return true
    }

    @Transactional
    fun simulateIncomingEmail(fromAddress: String, bodyText: String): Map<String, Any?> {
        var emailClean = fromAddress.trim()
        if (emailClean.contains("<") && emailClean.contains(">")) {
            emailClean = emailClean.substringAfter("<").substringBefore(">").trim()
        }

        val user = userRepository.findAll().firstOrNull { it.email?.lowercase() == emailClean.lowercase() }
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
                geminiParsed = parseDelegationEmailGemini(bodyText, ocrCfg.geminiApiKey)
            } else {
                geminiError = "Gemini key not configured or OCR disabled in settings"
            }
        } catch (e: Exception) {
            geminiError = e.message ?: e.toString()
        }

        val ocrCfg = ocrService.getOcrConfig()
        val useGemini = ocrCfg.ocrEnabled && ocrCfg.provider == "gemini" && geminiParsed != null
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
}
