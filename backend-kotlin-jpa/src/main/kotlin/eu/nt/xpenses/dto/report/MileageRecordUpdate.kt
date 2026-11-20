package eu.nt.xpenses.dto.report

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.validation.constraints.DecimalMin
import java.time.Instant

data class MileageRecordUpdate(
    val origin: String? = null,
    val destination: String? = null,
    @JsonProperty("distance_km") @field:DecimalMin(value = "0.01", inclusive = true) val distanceKm: Double? = null,
    @JsonProperty("start_time") val startTime: Instant? = null,
    @JsonProperty("end_time") val endTime: Instant? = null,
    val description: String? = null,
    @JsonProperty("vehicle_id") val vehicleId: Int? = null,
    @JsonProperty("clear_vehicle") val clearVehicle: Boolean = false,
    @JsonProperty("round_trip") val roundTrip: Boolean? = null
)
