package eu.nt.xpenses.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(
    name = "expense_review_operations",
    uniqueConstraints = [
        UniqueConstraint(
            name = "uq_expense_review_operations_key",
            columnNames = ["user_id", "request_key"]
        )
    ]
)
class ExpenseReviewOperation(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "expense_id", nullable = false)
    var expense: Expense,

    @Column(name = "request_key", nullable = false, length = 256)
    var requestKey: String,

    @Column(name = "request_hash", nullable = false, length = 64)
    var requestHash: String,

    @Column(name = "resulting_version", nullable = false)
    var resultingVersion: Int,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
