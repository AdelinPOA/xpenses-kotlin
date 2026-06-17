package eu.nt.xpenses.models

import com.fasterxml.jackson.annotation.JsonProperty

data class PagedResponse<T>(
    val data: List<T>,
    val page: Int,
    val size: Int,
    @JsonProperty("total_elements") val totalElements: Long,
    @JsonProperty("total_pages") val totalPages: Int
)
