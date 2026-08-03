package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonIgnore
import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "users")
class User(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(nullable = false, unique = true)
    var username: String,

    @Column(name = "display_name", nullable = false)
    var displayName: String,

    var email: String? = null,

    @field:JsonIgnore
    @Column(name = "password_hash")
    var passwordHash: String? = null,

    @Column(name = "auth_source", nullable = false)
    var authSource: String = "local",

    @Column(nullable = false)
    var role: String = "technician",

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "signature_path")
    var signaturePath: String? = null,

    @Column(name = "notifications_enabled", nullable = false)
    var notificationsEnabled: Boolean = true,

    @Column(nullable = false)
    var language: String = "en",

    @Column(name = "token_version", nullable = false)
    var tokenVersion: Int = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
