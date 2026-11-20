package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.vehicle.UserVehicleCreate
import eu.nt.xpenses.dto.vehicle.UserVehicleOut
import eu.nt.xpenses.dto.vehicle.UserVehicleUpdate
import eu.nt.xpenses.model.User
import eu.nt.xpenses.model.UserVehicle
import eu.nt.xpenses.repositories.UserRepository
import eu.nt.xpenses.repositories.UserVehicleRepository
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant

@RestController
@RequestMapping("/api/users/me/vehicles")
class UserVehicleController(
    private val userVehicleRepository: UserVehicleRepository,
    private val userRepository: UserRepository,
) {
    companion object {
        private val ALLOWED_FUEL_TYPES = setOf("petrol", "diesel", "hybrid", "electric", "lpg")
        private val MIN_CONSUMPTION = BigDecimal("0.01")
        private val MAX_CONSUMPTION = BigDecimal("50.00")
        private const val MAX_PLATE_LENGTH = 32
        private const val MAX_MAKE_MODEL_LENGTH = 120
    }

    @GetMapping
    fun listVehicles(request: HttpServletRequest): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))
        val userId = currentUser.id
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))

        val vehicles = userVehicleRepository.findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId)
        return ResponseEntity.ok(vehicles.map(UserVehicleOut::from))
    }

    @PostMapping
    @Transactional
    fun createVehicle(
        @RequestBody body: UserVehicleCreate,
        request: HttpServletRequest,
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))
        val userId = currentUser.id
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))

        userVehicleRepository.acquireUserLock(userId)

        val plateNumber = normalizePlate(body.plateNumber)
            ?: return ResponseEntity.badRequest().body(
                mapOf("detail" to "plate_number is required and must be at most $MAX_PLATE_LENGTH characters")
            )

        val makeModel = validateMakeModel(body.makeModel)
            ?: if (body.makeModel != null && body.makeModel.trim().length > MAX_MAKE_MODEL_LENGTH) {
                return ResponseEntity.badRequest().body(
                    mapOf("detail" to "make_model must be at most $MAX_MAKE_MODEL_LENGTH characters")
                )
            } else null

        val fuelType = try {
            validateFuelType(body.fuelType)
        } catch (ex: IllegalArgumentException) {
            return ResponseEntity.badRequest().body(mapOf("detail" to ex.message))
        }

        val consumption = body.fuelConsumptionLitersPer100Km
        if (consumption != null && !isValidConsumption(consumption)) {
            return ResponseEntity.badRequest().body(
                mapOf("detail" to "fuel_consumption_l_per_100km must be between 0.01 and 50.00 with at most 2 decimal places")
            )
        }
        val normalizedConsumption = consumption?.setScale(2, RoundingMode.HALF_UP)

        val now = Instant.now()
        val hasExisting = userVehicleRepository.countByUserId(userId) > 0
        val shouldBeDefault = body.isDefault == true || !hasExisting

        if (shouldBeDefault && hasExisting) {
            userVehicleRepository.clearDefaultForUser(userId, now)
        }

        val userRef = userRepository.getReferenceById(userId)
        val saved = userVehicleRepository.saveAndFlush(
            UserVehicle(
                user = userRef,
                plateNumber = plateNumber,
                makeModel = makeModel,
                fuelType = fuelType,
                fuelConsumptionLitersPer100Km = normalizedConsumption,
                isDefault = shouldBeDefault,
                createdAt = now,
                updatedAt = now,
            )
        )
        return ResponseEntity.status(HttpStatus.CREATED).body(UserVehicleOut.from(saved))
    }

    @PatchMapping("/{vehicleId}")
    @Transactional
    fun updateVehicle(
        @PathVariable vehicleId: Int,
        @RequestBody body: UserVehicleUpdate,
        request: HttpServletRequest,
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))
        val userId = currentUser.id
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))

        userVehicleRepository.acquireUserLock(userId)

        val normalizedPlate = if (body.plateNumber != null) {
            normalizePlate(body.plateNumber)
                ?: return ResponseEntity.badRequest().body(
                    mapOf("detail" to "plate_number must be non-blank and at most $MAX_PLATE_LENGTH characters")
                )
        } else null

        val normalizedMakeModel = if (!body.clearMakeModel && body.makeModel != null) {
            val trimmed = body.makeModel.trim()
            if (trimmed.length > MAX_MAKE_MODEL_LENGTH) {
                return ResponseEntity.badRequest().body(
                    mapOf("detail" to "make_model must be at most $MAX_MAKE_MODEL_LENGTH characters")
                )
            }
            trimmed.ifEmpty { null }
        } else null

        val normalizedFuelType = if (!body.clearFuelType && body.fuelType != null) {
            try {
                validateFuelType(body.fuelType)
            } catch (ex: IllegalArgumentException) {
                return ResponseEntity.badRequest().body(mapOf("detail" to ex.message))
            }
        } else null

        val normalizedConsumption = if (!body.clearFuelConsumption && body.fuelConsumptionLitersPer100Km != null) {
            if (!isValidConsumption(body.fuelConsumptionLitersPer100Km)) {
                return ResponseEntity.badRequest().body(
                    mapOf("detail" to "fuel_consumption_l_per_100km must be between 0.01 and 50.00 with at most 2 decimal places")
                )
            }
            body.fuelConsumptionLitersPer100Km.setScale(2, RoundingMode.HALF_UP)
        } else null

        val existing = userVehicleRepository.findByIdAndUserId(vehicleId, userId)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("detail" to "Vehicle not found"))

        if (existing.isDefault && body.isDefault == false) {
            return ResponseEntity.badRequest().body(
                mapOf("detail" to "Cannot unset default vehicle directly; set another vehicle as default instead")
            )
        }

        val now = Instant.now()
        val vehicle = if (body.isDefault == true && !existing.isDefault) {
            // clearDefaultForUser uses clearAutomatically = true, so re-fetch the target entity after clearing
            userVehicleRepository.clearDefaultForUser(userId, now)
            userVehicleRepository.findByIdAndUserId(vehicleId, userId)
                ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("detail" to "Vehicle not found"))
        } else {
            existing
        }

        if (normalizedPlate != null) {
            vehicle.plateNumber = normalizedPlate
        }
        if (body.clearMakeModel) {
            vehicle.makeModel = null
        } else if (body.makeModel != null) {
            vehicle.makeModel = normalizedMakeModel
        }
        if (body.clearFuelType) {
            vehicle.fuelType = null
        } else if (body.fuelType != null) {
            vehicle.fuelType = normalizedFuelType
        }
        if (body.clearFuelConsumption) {
            vehicle.fuelConsumptionLitersPer100Km = null
        } else if (normalizedConsumption != null) {
            vehicle.fuelConsumptionLitersPer100Km = normalizedConsumption
        }
        if (body.isDefault != null) {
            vehicle.isDefault = body.isDefault
        }
        vehicle.updatedAt = now

        val saved = userVehicleRepository.saveAndFlush(vehicle)
        return ResponseEntity.ok(UserVehicleOut.from(saved))
    }

    @DeleteMapping("/{vehicleId}")
    @Transactional
    fun deleteVehicle(
        @PathVariable vehicleId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))
        val userId = currentUser.id
            ?: return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(mapOf("detail" to "Not authenticated"))

        userVehicleRepository.acquireUserLock(userId)

        val vehicle = userVehicleRepository.findByIdAndUserId(vehicleId, userId)
            ?: return ResponseEntity.status(HttpStatus.NOT_FOUND).body(mapOf("detail" to "Vehicle not found"))

        val wasDefault = vehicle.isDefault
        userVehicleRepository.delete(vehicle)
        userVehicleRepository.flush()

        if (wasDefault) {
            val remaining = userVehicleRepository.findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId)
            remaining.firstOrNull()?.let { nextDefault ->
                nextDefault.isDefault = true
                nextDefault.updatedAt = Instant.now()
                userVehicleRepository.saveAndFlush(nextDefault)
            }
        }

        return ResponseEntity.noContent().build<Void>()
    }

    private fun normalizePlate(raw: String?): String? {
        val normalized = raw?.trim()?.uppercase() ?: return null
        if (normalized.isEmpty() || normalized.length > MAX_PLATE_LENGTH) return null
        return normalized
    }

    private fun validateMakeModel(raw: String?): String? {
        val trimmed = raw?.trim() ?: return null
        if (trimmed.length > MAX_MAKE_MODEL_LENGTH) return null
        return trimmed.ifEmpty { null }
    }

    private fun validateFuelType(raw: String?): String? {
        val normalized = raw?.trim()?.lowercase() ?: return null
        if (normalized.isEmpty()) return null
        if (normalized !in ALLOWED_FUEL_TYPES) {
            throw IllegalArgumentException("Invalid fuel_type. Must be one of: $ALLOWED_FUEL_TYPES")
        }
        return normalized
    }

    private fun isValidConsumption(value: BigDecimal): Boolean =
        value.compareTo(MIN_CONSUMPTION) >= 0 &&
            value.compareTo(MAX_CONSUMPTION) <= 0 &&
            value.stripTrailingZeros().scale() <= 2
}
