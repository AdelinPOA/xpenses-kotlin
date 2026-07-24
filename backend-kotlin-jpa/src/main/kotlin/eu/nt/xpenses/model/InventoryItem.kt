package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "inventory_items")
class InventoryItem(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User? = null,

    @Column(nullable = false)
    var name: String,

    var description: String? = null,

    @JsonProperty("serial_number")
    var serialNumber: String? = null,

    var category: String? = null,

    @JsonProperty("purchase_date")
    var purchaseDate: String? = null,

    @JsonProperty("purchase_value")
    var purchaseValue: BigDecimal? = null,

    @Column(nullable = false)
    var status: String = "active",

    var notes: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
) {
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "request_id")
    var request: InventoryRequest? = null
}
