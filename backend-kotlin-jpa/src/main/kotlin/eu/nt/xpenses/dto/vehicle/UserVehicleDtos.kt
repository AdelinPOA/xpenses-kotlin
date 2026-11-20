package eu.nt.xpenses.dto.vehicle

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.model.UserVehicle
import java.math.BigDecimal
import java.time.Instant

data class UserVehicleCreate(
    @JsonProperty("plate_number") val plateNumber: String? = null,
    @JsonProperty("make_model") val makeModel: String? = null,
    @JsonProperty("fuel_type") val fuelType: String? = null,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal? = null,
    @JsonProperty("is_default") val isDefault: Boolean? = null,
)

data class UserVehicleUpdate(
    @JsonProperty("plate_number") val plateNumber: String? = null,
    @JsonProperty("make_model") val makeModel: String? = null,
    @JsonProperty("clear_make_model") val clearMakeModel: Boolean = false,
    @JsonProperty("fuel_type") val fuelType: String? = null,
    @JsonProperty("clear_fuel_type") val clearFuelType: Boolean = false,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal? = null,
    @JsonProperty("clear_fuel_consumption") val clearFuelConsumption: Boolean = false,
    @JsonProperty("is_default") val isDefault: Boolean? = null,
)

data class UserVehicleOut(
    val id: Int,
    @JsonProperty("plate_number") val plateNumber: String,
    @JsonProperty("make_model") val makeModel: String?,
    @JsonProperty("fuel_type") val fuelType: String?,
    @JsonProperty("fuel_consumption_l_per_100km") val fuelConsumptionLitersPer100Km: BigDecimal?,
    @JsonProperty("is_default") val isDefault: Boolean,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant,
) {
    companion object {
        fun from(vehicle: UserVehicle): UserVehicleOut = UserVehicleOut(
            id = vehicle.id ?: throw IllegalStateException("UserVehicle must be persisted"),
            plateNumber = vehicle.plateNumber,
            makeModel = vehicle.makeModel,
            fuelType = vehicle.fuelType,
            fuelConsumptionLitersPer100Km = vehicle.fuelConsumptionLitersPer100Km,
            isDefault = vehicle.isDefault,
            createdAt = vehicle.createdAt,
            updatedAt = vehicle.updatedAt,
        )
    }
}
