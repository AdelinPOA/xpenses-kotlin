package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "ocr_jobs")
class OcrJob(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User? = null,

    @Column(nullable = false)
    var status: String = OcrJobStatus.PENDING,

    @Column(nullable = false, length = 20)
    var stage: String = OcrJobStage.OCR,

    @Column(name = "lease_token", length = 128)
    var leaseToken: String? = null,

    @Column(name = "lease_until")
    var leaseUntil: Instant? = null,

    @Column(name = "attempt_count", nullable = false)
    var attemptCount: Int = 0,

    @Column(name = "next_attempt_at")
    var nextAttemptAt: Instant? = null,

    @Column(nullable = false)
    var filename: String = "",

    @Column(name = "source_path", length = 1024)
    var sourcePath: String? = null,

    @Column(name = "source_content_type")
    var sourceContentType: String? = null,

    @Column(name = "source_size_bytes")
    var sourceSizeBytes: Long? = null,

    @Column(name = "source_sha256", length = 64)
    var sourceSha256: String? = null,

    @Column(name = "acceptance_key", length = 256)
    var acceptanceKey: String? = null,

    @Column(name = "acceptance_fingerprint", length = 64)
    var acceptanceFingerprint: String? = null,

    @Column(name = "requested_report_id")
    var requestedReportId: Int? = null,

    @Column(name = "report_link_status", nullable = false, length = 24)
    var reportLinkStatus: String = "NOT_REQUESTED",

    @Column(name = "result_json", columnDefinition = "TEXT")
    var resultJson: String? = null,

    @Column(name = "error_code", length = 100)
    var errorCode: String? = null,

    @Column(name = "error_message", columnDefinition = "TEXT")
    var errorMessage: String? = null,

    @Column(name = "expense_id")
    var expenseId: Int? = null,

    @Column(name = "receipt_id")
    var receiptId: Int? = null,

    @Column(name = "expires_at")
    var expiresAt: Instant? = null,

    @Column(name = "completed_at")
    var completedAt: Instant? = null,

    @Column(name = "legacy_status", length = 50)
    var legacyStatus: String? = null,

    @Column(name = "unrecoverable_reason", length = 100)
    var unrecoverableReason: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
