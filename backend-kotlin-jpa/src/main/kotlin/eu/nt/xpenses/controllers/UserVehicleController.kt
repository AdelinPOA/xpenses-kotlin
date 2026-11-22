package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.vehicle.UserVehicleCreate
import eu.nt.xpenses.dto.vehicle.UserVehicleOut
import eu.nt.xpenses.dto.vehicle.UserVehicleUpdate
import eu.nt.xpenses.mileage.VehicleMileage
import eu.nt.xpenses.model.User
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/users/me/vehicles")
class UserVehicleController(
    private val vehicleMileage: VehicleMileage,
) {
    private fun requireCurrentUser(request: HttpServletRequest): User =
        request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

    @GetMapping
    fun listVehicles(request: HttpServletRequest): ResponseEntity<List<UserVehicleOut>> =
        ResponseEntity.ok(vehicleMileage.listVehicles(requireCurrentUser(request)))

    @PostMapping
    fun createVehicle(
        @RequestBody body: UserVehicleCreate,
        request: HttpServletRequest,
    ): ResponseEntity<UserVehicleOut> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(vehicleMileage.createVehicle(body, requireCurrentUser(request)))

    @PatchMapping("/{vehicleId}")
    fun updateVehicle(
        @PathVariable vehicleId: Int,
        @RequestBody body: UserVehicleUpdate,
        request: HttpServletRequest,
    ): ResponseEntity<UserVehicleOut> =
        ResponseEntity.ok(vehicleMileage.updateVehicle(vehicleId, body, requireCurrentUser(request)))

    @DeleteMapping("/{vehicleId}")
    fun deleteVehicle(
        @PathVariable vehicleId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<Void> {
        vehicleMileage.deleteVehicle(vehicleId, requireCurrentUser(request))
        return ResponseEntity.noContent().build()
    }
}
