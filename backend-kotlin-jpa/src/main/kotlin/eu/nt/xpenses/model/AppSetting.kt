package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "app_settings")
class AppSetting(
    @Id
    var key: String,

    @Column(nullable = false)
    var value: String,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
