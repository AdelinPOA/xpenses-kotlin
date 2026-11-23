package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.DecimalMax
import jakarta.validation.constraints.DecimalMin
import jakarta.validation.constraints.Size
import java.time.Instant

data class MileageRecordUpdate(
    @field:Size(max = 255) val origin: String? = null,
    @field:Size(max = 255) val destination: String? = null,
    @JsonProperty("distance_km") @field:DecimalMin(value = "0.01", inclusive = true) @field:DecimalMax(value = "100000.0", inclusive = true) val distanceKm: Double? = null,
    @JsonProperty("start_time") val startTime: Instant? = null,
    @JsonProperty("end_time") val endTime: Instant? = null,
    @field:Size(max = 1000) val description: String? = null,
    @JsonProperty("vehicle_id") val vehicleId: Int? = null,
    @JsonProperty("clear_vehicle") val clearVehicle: Boolean = false,
    @JsonProperty("round_trip") val roundTrip: Boolean? = null,
    @JsonProperty("version") val version: Int? = null
)
