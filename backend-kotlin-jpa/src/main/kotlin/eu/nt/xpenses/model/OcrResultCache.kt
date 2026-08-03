package eu.nt.xpenses.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "ocr_result_cache")
class OcrResultCache(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(nullable = false, length = 64)
    var sha256: String,

    @Column(nullable = false, length = 50)
    var provider: String,

    @Column(nullable = false, length = 100)
    var model: String,

    @Column(name = "contract_version", nullable = false, length = 50)
    var contractVersion: String,

    @Column(name = "result_json", nullable = false, columnDefinition = "TEXT")
    var resultJson: String,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "last_used_at", nullable = false)
    var lastUsedAt: Instant = Instant.now()
)
