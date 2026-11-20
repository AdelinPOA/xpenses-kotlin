package eu.nt.xpenses.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "user_vehicles")
class UserVehicle(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(name = "plate_number", nullable = false, length = 32)
    var plateNumber: String,

    @Column(name = "make_model", length = 120)
    var makeModel: String? = null,

    @Column(name = "fuel_type", length = 20)
    var fuelType: String? = null,

    @Column(name = "fuel_consumption_l_per_100km", precision = 5, scale = 2)
    var fuelConsumptionLitersPer100Km: BigDecimal? = null,

    @Column(name = "is_default", nullable = false)
    var isDefault: Boolean = false,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),
)
