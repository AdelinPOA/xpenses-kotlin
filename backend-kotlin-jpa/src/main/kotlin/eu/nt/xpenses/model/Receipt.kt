package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonBackReference
import jakarta.persistence.*
import org.hibernate.annotations.SQLDelete
import org.hibernate.annotations.SQLRestriction
import java.time.Instant

@Entity
@Table(name = "receipts")
@SQLDelete(sql = "UPDATE receipts SET deleted = true, deleted_at = NOW() WHERE id=?")
@SQLRestriction("deleted = false")
class Receipt(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @JsonBackReference("expense-receipts")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_id", nullable = false)
    var expense: Expense,

    @Column(name = "file_path", nullable = false)
    var filePath: String,

    @Column(name = "original_name")
    var originalName: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(nullable = false)
    var deleted: Boolean = false,

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null
)
