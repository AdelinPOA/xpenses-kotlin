package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.User
import eu.nt.xpenses.models.UserResponse
import eu.nt.xpenses.repositories.RefreshTokenRepository
import eu.nt.xpenses.repositories.UserRepository
import jakarta.servlet.http.HttpServletRequest
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import jakarta.validation.constraints.Pattern
import jakarta.validation.constraints.Size
import jakarta.validation.constraints.NotNull
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import java.time.Instant

@RestController
@RequestMapping("/api/users")
class UserController(
    private val userRepository: UserRepository,
    private val passwordEncoder: BCryptPasswordEncoder,
    private val refreshTokenRepository: RefreshTokenRepository
) {
    private val validRoles = setOf("technician", "manager", "chef_finance", "mod")

    @PostMapping
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun createUser(@Valid @RequestBody body: UserCreateRequest): ResponseEntity<*> {
        if (body.role !in validRoles) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Invalid role. Must be one of: $validRoles"))
        }
        val existing = userRepository.findByUsername(body.username)
        if (existing != null) {
            return ResponseEntity.status(409).body(mapOf("detail" to "Username already taken"))
        }

        val newUser = User(
            username = body.username,
            displayName = body.displayName,
            email = body.email,
            passwordHash = passwordEncoder.encode(body.password),
            authSource = "local",
            role = body.role,
            isActive = true,
            createdAt = Instant.now(),
            updatedAt = Instant.now()
        )
        val saved = userRepository.save(newUser)
        return ResponseEntity.status(201).body(UserResponse.fromUser(saved))
    }

    @GetMapping
    fun listUsers(request: HttpServletRequest): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Not authenticated"))

        if (currentUser.role !in setOf("chef_finance", "manager", "mod")) {
            return ResponseEntity.status(403).body(mapOf("detail" to "Forbidden"))
        }

        val users = userRepository.findAllByOrderByCreatedAt()
        return ResponseEntity.ok(users.map { UserResponse.fromUser(it) })
    }

    @GetMapping("/{userId}")
    fun getUser(
        @PathVariable userId: Int,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Not authenticated"))

        if (userId != currentUser.id && currentUser.role !in setOf("chef_finance", "manager", "mod")) {
            return ResponseEntity.status(403).body(mapOf("detail" to "Forbidden"))
        }

        val user = userRepository.findById(userId).orElse(null)
            ?: return ResponseEntity.status(404).body(mapOf("detail" to "User not found"))

        return ResponseEntity.ok(UserResponse.fromUser(user))
    }

    @PutMapping("/{userId}/role")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateRole(
        @PathVariable userId: Int,
        @Valid @RequestBody body: RoleUpdateRequest,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as User
        if (body.role !in validRoles) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Invalid role. Must be one of: $validRoles"))
        }
        if (userId == currentUser.id) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Cannot change your own role"))
        }

        val user = userRepository.findById(userId).orElse(null)
            ?: return ResponseEntity.status(404).body(mapOf("detail" to "User not found"))

        user.role = body.role
        user.updatedAt = Instant.now()
        val saved = userRepository.save(user)
        return ResponseEntity.ok(UserResponse.fromUser(saved))
    }

    @PutMapping("/{userId}/active")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateActive(
        @PathVariable userId: Int,
        @Valid @RequestBody body: ActiveUpdateRequest,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as User
        if (userId == currentUser.id) {
            return ResponseEntity.status(400).body(mapOf("detail" to "Cannot deactivate yourself"))
        }

        val user = userRepository.findById(userId).orElse(null)
            ?: return ResponseEntity.status(404).body(mapOf("detail" to "User not found"))

        user.isActive = body.isActive!!
        user.updatedAt = Instant.now()
        val saved = userRepository.save(user)

        if (!body.isActive!!) {
            refreshTokenRepository.deleteByUserId(userId)
        }

        return ResponseEntity.ok(UserResponse.fromUser(saved))
    }

    @PatchMapping("/me")
    @Transactional
    fun updateMe(
        @Valid @RequestBody body: UserUpdateMeRequest,
        request: HttpServletRequest
    ): ResponseEntity<*> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: return ResponseEntity.status(401).body(mapOf("detail" to "Not authenticated"))

        var changed = false
        if (body.displayName != null) {
            currentUser.displayName = body.displayName
            changed = true
        }
        if (body.notificationsEnabled != null) {
            currentUser.notificationsEnabled = body.notificationsEnabled
            changed = true
        }

        val saved = if (changed) {
            currentUser.updatedAt = Instant.now()
            userRepository.save(currentUser)
        } else {
            currentUser
        }

        return ResponseEntity.ok(UserResponse.fromUser(saved))
    }
}

data class UserCreateRequest(
    @field:NotBlank val username: String,
    @JsonProperty("display_name") @field:NotBlank val displayName: String,
    @field:NotBlank @field:Size(min = 8) val password: String,
    @field:Pattern(regexp = "technician|manager|chef_finance|mod") val role: String,
    val email: String? = null
)

data class RoleUpdateRequest(
    @field:NotBlank val role: String
)

data class ActiveUpdateRequest(
    @JsonProperty("is_active") @field:NotNull val isActive: Boolean? = null
)

data class UserUpdateMeRequest(
    @JsonProperty("display_name") @field:Size(min = 1) val displayName: String? = null,
    @JsonProperty("notifications_enabled") val notificationsEnabled: Boolean? = null
)
