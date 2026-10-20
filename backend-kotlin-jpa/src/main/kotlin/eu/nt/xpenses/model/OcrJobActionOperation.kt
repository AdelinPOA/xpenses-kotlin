package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(
    name = "ocr_job_action_operations",
    uniqueConstraints = [
        UniqueConstraint(
            name = "uq_ocr_job_action_operations_key",
            columnNames = ["user_id", "job_id", "action", "request_key"]
        )
    ]
)
class OcrJobActionOperation(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "job_id", nullable = false)
    var job: OcrJob,

    @Column(nullable = false, length = 32)
    var action: String,

    @Column(name = "request_key", nullable = false, length = 256)
    var requestKey: String,

    @Column(name = "request_hash", nullable = false, length = 64)
    var requestHash: String,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
