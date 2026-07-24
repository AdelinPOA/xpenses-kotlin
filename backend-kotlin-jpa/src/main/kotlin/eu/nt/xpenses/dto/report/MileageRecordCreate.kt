package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.NotBlank
import java.time.Instant

data class MileageRecordCreate(
    @field:NotBlank val origin: String,
    @field:NotBlank val destination: String,
    @JsonProperty("distance_km") @field:DecimalMin(value = "0.01", inclusive = true) val distanceKm: Double,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    val description: String? = null
)
