package eu.nt.xpenses.dto.dashboard

import com.fasterxml.jackson.annotation.JsonProperty
import java.math.BigDecimal

data class CategorySpend(
    @JsonProperty("category_id") val categoryId: Int?,
    @JsonProperty("category_name") val categoryName: String,
    val total: BigDecimal,
    val count: Int
)
