package eu.nt.xpenses.models

import com.fasterxml.jackson.annotation.JsonBackReference
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "expenses")
class Expense(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null,

    @Column(nullable = false)
    var description: String,

    @Column(nullable = false)
    var amount: BigDecimal,

    @Column(nullable = false)
    var currency: String,

    @JsonBackReference
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id", nullable = false)
    var report: Report,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
