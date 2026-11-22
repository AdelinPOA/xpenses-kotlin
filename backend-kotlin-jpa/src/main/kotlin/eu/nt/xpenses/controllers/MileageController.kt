package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.report.MileageRecordCreate
import eu.nt.xpenses.dto.report.MileageRecordOut
import eu.nt.xpenses.dto.report.MileageRecordUpdate
import eu.nt.xpenses.mileage.VehicleMileage
import eu.nt.xpenses.model.User
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import org.springframework.http.HttpHeaders
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/reports/{reportId}/mileage")
class MileageController(
    private val vehicleMileage: VehicleMileage,
) {
    private fun requireCurrentUser(request: HttpServletRequest): User =
        request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

    @GetMapping
    fun listMileage(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): List<MileageRecordOut> =
        vehicleMileage.listMileage(reportId, requireCurrentUser(request))

    @GetMapping("/trip-sheet")
    fun downloadTripSheet(
        @PathVariable reportId: Int,
        request: HttpServletRequest,
    ): ResponseEntity<ByteArray> {
        val download = vehicleMileage.exportTripSheet(reportId, requireCurrentUser(request))
        return ResponseEntity.ok()
            .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"${download.filename}\"")
            .contentType(MediaType.parseMediaType("application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
            .body(download.bytes)
    }

    @PostMapping
    fun createMileage(
        @PathVariable reportId: Int,
        @Valid @RequestBody body: MileageRecordCreate,
        request: HttpServletRequest,
    ): ResponseEntity<MileageRecordOut> =
        ResponseEntity.status(HttpStatus.CREATED)
            .body(vehicleMileage.createMileage(reportId, body, requireCurrentUser(request)))

    @PatchMapping("/{mileageId}")
    fun updateMileage(
        @PathVariable reportId: Int,
        @PathVariable mileageId: Int,
        @Valid @RequestBody body: MileageRecordUpdate,
        request: HttpServletRequest,
    ): MileageRecordOut =
        vehicleMileage.updateMileage(reportId, mileageId, body, requireCurrentUser(request))

    @DeleteMapping("/{mileageId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    fun deleteMileage(
        @PathVariable reportId: Int,
        @PathVariable mileageId: Int,
        request: HttpServletRequest,
    ) {
        vehicleMileage.deleteMileage(reportId, mileageId, requireCurrentUser(request))
    }
}
