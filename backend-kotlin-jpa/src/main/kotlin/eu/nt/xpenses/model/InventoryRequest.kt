package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "inventory_requests")
class InventoryRequest(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User? = null,

    @Column(name = "item_name", nullable = false)
    var itemName: String,

    var description: String? = null,

    @Column(nullable = false)
    var quantity: Int = 1,

    @Column(nullable = false)
    var status: String = "pending",

    @Column(name = "rejection_reason")
    var rejectionReason: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "approved_by")
    var approvedBy: User? = null,

    @Column(name = "approved_at")
    var approvedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rejected_by")
    var rejectedBy: User? = null,

    @Column(name = "rejected_at")
    var rejectedAt: Instant? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
