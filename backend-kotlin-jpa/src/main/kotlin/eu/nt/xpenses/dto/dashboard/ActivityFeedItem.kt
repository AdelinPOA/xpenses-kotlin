package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal

data class ActivityFeedItem(
    val id: String,
    val type: String,
    @JsonProperty("actor_name") val actorName: String,
    @JsonProperty("target_title") val targetTitle: String,
    @JsonProperty("user_name") val userName: String,
    @JsonProperty("amount_eur") val amountEur: BigDecimal,
    val timestamp: String
)
