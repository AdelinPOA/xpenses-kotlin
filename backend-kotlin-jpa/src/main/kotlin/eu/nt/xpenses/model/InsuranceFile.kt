package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "insurance_files")
class InsuranceFile(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User? = null,
    @Column(nullable = false)
    var title: String,
    var description: String? = null,
    @Column(name = "file_path", nullable = false)
    var filePath: String,
    @Column(name = "file_name")
    var fileName: String? = null,
    @Column(name = "file_size")
    var fileSize: Long? = null,
    @Column(name = "file_type")
    var fileType: String? = null,
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "uploaded_by")
    var uploadedBy: User? = null,
    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),
    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)
