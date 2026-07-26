package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.model.InventoryItem
import eu.nt.xpenses.model.InventoryRequest
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.InventoryItemRepository
import eu.nt.xpenses.repositories.InventoryRequestRepository
import eu.nt.xpenses.services.Authorization
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.Min
import jakarta.validation.constraints.Max
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.PositiveOrZero
import org.springframework.http.HttpStatus
import org.springframework.http.ResponseEntity
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal
import java.time.Instant

@RestController
@RequestMapping("/api/inventory")
class InventoryController(
    private val inventoryItemRepository: InventoryItemRepository,
    private val inventoryRequestRepository: InventoryRequestRepository,
    private val authorization: Authorization,
) {
    // ── Items ──────────────────────────────────────────────────────────────

    @GetMapping
    fun listItems(
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): List<InventoryItemOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val items = if (all && authorization.canViewAll(currentUser)) {
            inventoryItemRepository.findAllByOrderByCreatedAtDesc()
        } else {
            inventoryItemRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.id!!)
        }

        return items.map { mapToOut(it) }
    }

    @GetMapping("/{itemId}")
    fun getItem(
        @PathVariable itemId: Int,
        request: HttpServletRequest
    ): InventoryItemOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val item = inventoryItemRepository.findById(itemId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found")
        }

        if (!authorization.canView(currentUser, item.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your item")
        }

        return mapToOut(item)
    }

    @PostMapping
    @Transactional
    fun createItem(
        @Valid @RequestBody body: InventoryItemCreate,
        request: HttpServletRequest
    ): ResponseEntity<InventoryItemOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val item = InventoryItem(
            user = currentUser,
            name = body.name,
            description = body.description,
            serialNumber = body.serialNumber,
            category = body.category,
            purchaseDate = body.purchaseDate,
            purchaseValue = body.purchaseValue?.let { BigDecimal.valueOf(it) },
            status = "active",
            notes = body.notes,
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val saved = inventoryItemRepository.save(item)
        return ResponseEntity.status(HttpStatus.CREATED).body(mapToOut(saved))
    }

    @PatchMapping("/{itemId}")
    @Transactional
    fun updateItem(
        @PathVariable itemId: Int,
        @Valid @RequestBody body: InventoryItemUpdate,
        request: HttpServletRequest
    ): InventoryItemOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val item = inventoryItemRepository.findById(itemId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found")
        }

        if (!authorization.canView(currentUser, item.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your item")
        }

        if (body.name != null) item.name = body.name
        if (body.description != null) item.description = body.description
        if (body.serialNumber != null) item.serialNumber = body.serialNumber
        if (body.category != null) item.category = body.category
        if (body.purchaseDate != null) item.purchaseDate = body.purchaseDate
        if (body.purchaseValue != null) item.purchaseValue = BigDecimal.valueOf(body.purchaseValue)
        if (body.status != null) {
            if (body.status !in listOf("active", "retired", "lost", "transferred")) {
                throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid status. Must be: active, retired, lost, transferred")
            }
            item.status = body.status
        }
        if (body.notes != null) item.notes = body.notes

        item.updatedAt = Instant.now()
        val saved = inventoryItemRepository.save(item)
        return mapToOut(saved)
    }

    @DeleteMapping("/{itemId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    @Transactional
    fun deleteItem(
        @PathVariable itemId: Int,
        request: HttpServletRequest
    ) {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val item = inventoryItemRepository.findById(itemId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Inventory item not found")
        }

        if (!authorization.canView(currentUser, item.user?.id)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Not your item")
        }

        inventoryItemRepository.delete(item)
    }

    // ── Requests ───────────────────────────────────────────────────────────

    @GetMapping("/requests")
    fun listRequests(
        @RequestParam(value = "mine", required = false, defaultValue = "false") mine: Boolean,
        @RequestParam(value = "status", required = false) status: String?,
        request: HttpServletRequest
    ): List<InventoryRequestOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val isPrivileged = authorization.canViewAll(currentUser)

        val reqs = when {
            mine -> inventoryRequestRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.id!!)
            status != null && isPrivileged -> inventoryRequestRepository.findAllByStatus(status)
            isPrivileged -> inventoryRequestRepository.findAllByOrderByCreatedAtDesc()
            else -> inventoryRequestRepository.findAllByUserIdOrderByCreatedAtDesc(currentUser.id!!)
        }

        return reqs.map { mapRequestToOut(it) }
    }

    @PostMapping("/requests")
    @Transactional
    fun createRequest(
        @Valid @RequestBody body: InventoryRequestCreate,
        request: HttpServletRequest
    ): ResponseEntity<InventoryRequestOut> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        val req = InventoryRequest(
            user = currentUser,
            itemName = body.itemName,
            description = body.description,
            quantity = body.quantity,
            status = "pending",
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )

        val saved = inventoryRequestRepository.save(req)
        return ResponseEntity.status(HttpStatus.CREATED).body(mapRequestToOut(saved))
    }

    @PostMapping("/requests/{requestId}/approve")
    @Transactional
    fun approveRequest(
        @PathVariable requestId: Int,
        request: HttpServletRequest
    ): ResponseEntity<Map<String, Any>> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canViewAll(currentUser)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only managers and admins can approve requests")
        }

        val req = inventoryRequestRepository.findById(requestId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found")
        }

        if (req.status != "pending") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only pending requests can be approved")
        }

        val now = Instant.now()
        req.status = "approved"
        req.approvedBy = currentUser
        req.approvedAt = now
        req.updatedAt = now
        inventoryRequestRepository.save(req)

        // Create InventoryItems for the requester (one per requested quantity)
        val qty = maxOf(req.quantity, 1)
        val items = (1..qty).map {
            val item = InventoryItem(
                user = req.user,
                name = req.itemName,
                description = req.description,
                status = "active",
                createdAt = now,
                updatedAt = now
            )
            item.request = req
            inventoryItemRepository.save(item)
        }

        return ResponseEntity.ok(mapOf(
            "request" to mapRequestToOut(req),
            "items" to items.map { mapToOut(it) },
            "item" to mapToOut(items.first())
        ))
    }

    @PostMapping("/requests/{requestId}/reject")
    @Transactional
    fun rejectRequest(
        @PathVariable requestId: Int,
        @Valid @RequestBody body: InventoryRejectBody,
        request: HttpServletRequest
    ): InventoryRequestOut {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (!authorization.canViewAll(currentUser)) {
            throw ResponseStatusException(HttpStatus.FORBIDDEN, "Only managers and admins can reject requests")
        }

        val req = inventoryRequestRepository.findById(requestId).orElseThrow {
            ResponseStatusException(HttpStatus.NOT_FOUND, "Request not found")
        }

        if (req.status != "pending") {
            throw ResponseStatusException(HttpStatus.BAD_REQUEST, "Only pending requests can be rejected")
        }

        val now = Instant.now()
        req.status = "rejected"
        req.rejectionReason = body.reason
        req.rejectedBy = currentUser
        req.rejectedAt = now
        req.updatedAt = now

        val saved = inventoryRequestRepository.save(req)
        return mapRequestToOut(saved)
    }

    // ── Mappers ────────────────────────────────────────────────────────────

    private fun mapToOut(item: InventoryItem): InventoryItemOut = InventoryItemOut(
        id = item.id!!,
        userId = item.user?.id,
        userDisplayName = item.user?.displayName,
        name = item.name,
        description = item.description,
        serialNumber = item.serialNumber,
        category = item.category,
        purchaseDate = item.purchaseDate,
        purchaseValue = item.purchaseValue?.toDouble(),
        status = item.status,
        notes = item.notes,
        createdAt = item.createdAt,
        updatedAt = item.updatedAt
    )

    private fun mapRequestToOut(req: InventoryRequest): InventoryRequestOut = InventoryRequestOut(
        id = req.id!!,
        userId = req.user?.id,
        userDisplayName = req.user?.displayName,
        itemName = req.itemName,
        description = req.description,
        quantity = req.quantity,
        status = req.status,
        rejectionReason = req.rejectionReason,
        approvedBy = req.approvedBy?.id,
        approvedByName = req.approvedBy?.displayName,
        approvedAt = req.approvedAt,
        rejectedBy = req.rejectedBy?.id,
        rejectedByName = req.rejectedBy?.displayName,
        rejectedAt = req.rejectedAt,
        createdAt = req.createdAt,
        updatedAt = req.updatedAt
    )
}

// ── DTOs ──────────────────────────────────────────────────────────────────

data class InventoryItemOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    val name: String,
    val description: String?,
    @JsonProperty("serial_number") val serialNumber: String?,
    val category: String?,
    @JsonProperty("purchase_date") val purchaseDate: String?,
    @JsonProperty("purchase_value") val purchaseValue: Double?,
    val status: String,
    val notes: String?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)

data class InventoryItemCreate(
    @field:NotBlank val name: String,
    val description: String? = null,
    @JsonProperty("serial_number") val serialNumber: String? = null,
    val category: String? = null,
    @JsonProperty("purchase_date") val purchaseDate: String? = null,
    @JsonProperty("purchase_value") @field:PositiveOrZero val purchaseValue: Double? = null,
    val notes: String? = null
)

data class InventoryItemUpdate(
    val name: String? = null,
    val description: String? = null,
    @JsonProperty("serial_number") val serialNumber: String? = null,
    val category: String? = null,
    @JsonProperty("purchase_date") val purchaseDate: String? = null,
    @JsonProperty("purchase_value") @field:PositiveOrZero val purchaseValue: Double? = null,
    val status: String? = null,
    val notes: String? = null
)

data class InventoryRequestOut(
    val id: Int,
    @JsonProperty("user_id") val userId: Int?,
    @JsonProperty("user_display_name") val userDisplayName: String?,
    @JsonProperty("item_name") val itemName: String,
    val description: String?,
    val quantity: Int,
    val status: String,
    @JsonProperty("rejection_reason") val rejectionReason: String?,
    @JsonProperty("approved_by") val approvedBy: Int?,
    @JsonProperty("approved_by_name") val approvedByName: String?,
    @JsonProperty("approved_at") val approvedAt: Instant?,
    @JsonProperty("rejected_by") val rejectedBy: Int?,
    @JsonProperty("rejected_by_name") val rejectedByName: String?,
    @JsonProperty("rejected_at") val rejectedAt: Instant?,
    @JsonProperty("created_at") val createdAt: Instant,
    @JsonProperty("updated_at") val updatedAt: Instant
)

data class InventoryRequestCreate(
    @JsonProperty("item_name") @field:NotBlank val itemName: String,
    val description: String? = null,
    @field:Min(1) @field:Max(100) val quantity: Int = 1
)

data class InventoryRejectBody(
    @field:NotBlank val reason: String
)
