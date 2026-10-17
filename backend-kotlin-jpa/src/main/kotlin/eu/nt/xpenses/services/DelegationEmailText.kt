package eu.nt.xpenses.services

import org.jsoup.Jsoup
import org.jsoup.nodes.TextNode

/** Parse locally only: HTML email content must never trigger network fetches. */
internal object DelegationEmailText {
    fun normalize(source: String): String {
        val text =
            if (Regex("(?i)<(?:html|body|table|tr|td|div|p|br)\\b").containsMatchIn(source)) {
                val document = Jsoup.parse(source)
                document.select("script, style, head").remove()
                document.select("br").before("\n")
                document.select("p, div, li").after("\n")
                // Collapse each table row as a unit: Outlook often wraps *each cell* in a
                // paragraph, which must not separate the field label from its value.
                document.select("tr").reversed().forEach { row ->
                    val cells = row.children().filter { it.normalName() in setOf("td", "th") }
                    if (cells.isNotEmpty()) {
                        val values =
                            cells.map { cell ->
                                cell
                                    .wholeText()
                                    .lines()
                                    .map { it.trim() }
                                    .filter { it.isNotBlank() }
                                    .joinToString("\n")
                            }
                        row.replaceWith(TextNode("\n" + values.joinToString("\t") + "\n"))
                    }
                }
                document.body().wholeText()
            } else {
                source
            }
        return text.replace('\u00a0', ' ').replace("\r\n", "\n").replace('\r', '\n')
    }

    private val orderPatterns =
        listOf("Kundenauftrag", "Auftrag", "Order(?:[ \\t]+(?:nr\\.?|number|no\\.?))?").map { label ->
            Regex("(?im)^[ \\t]*$label(?:[ \\t]*[:#][ \\t]*|[ \\t]+)([^\\s:]+)")
        }

    fun orderNumber(text: String): String? =
        orderPatterns.firstNotNullOfOrNull { pattern ->
            pattern.findAll(text).map { it.groupValues[1] }.firstOrNull { value -> value.any { it.isDigit() } }
        }
}
