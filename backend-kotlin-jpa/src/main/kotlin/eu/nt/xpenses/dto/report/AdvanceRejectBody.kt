package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty

data class AdvanceRejectBody(
    val reason: String = ""
)
