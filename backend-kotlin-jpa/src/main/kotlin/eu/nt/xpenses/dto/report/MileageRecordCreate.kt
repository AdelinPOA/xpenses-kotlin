package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Size
import java.time.Instant

data class MileageRecordCreate(
    @field:NotBlank @field:Size(max = 255) val origin: String,
    @field:NotBlank @field:Size(max = 255) val destination: String,
    @JsonProperty("distance_km") @field:DecimalMin(value = "0.01", inclusive = true) @field:DecimalMax(value = "100000.0", inclusive = true) val distanceKm: Double,
    @JsonProperty("start_time") val startTime: Instant,
    @JsonProperty("end_time") val endTime: Instant,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("vehicle_id") val vehicleId: Int? = null,
    @JsonProperty("round_trip") val roundTrip: Boolean = false
)
