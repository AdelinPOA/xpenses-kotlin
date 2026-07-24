package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonBackReference
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "advance_payments")
class AdvancePayment(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @JsonBackReference("report-advances")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id", nullable = false)
    var report: ExpenseReport,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(name = "amount_original", nullable = false)
    var amountOriginal: BigDecimal,

    @Column(name = "currency_original", nullable = false)
    var currencyOriginal: String = "EUR",

    @Column(name = "amount_eur", nullable = false)
    var amountEur: BigDecimal,

    @Column(name = "fx_rate", nullable = false)
    var fxRate: BigDecimal = BigDecimal.ONE,

    @Column(nullable = false)
    var date: String,

    var description: String? = null,

    @Column(nullable = false)
    var status: String = "paid",

    @Column(name = "requested_amount")
    var requestedAmount: BigDecimal? = null,

    @Column(name = "requested_currency")
    var requestedCurrency: String? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "paid_by")
    var paidBy: User? = null,

    @Column(name = "paid_at")
    var paidAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "rejected_by")
    var rejectedBy: User? = null,

    @Column(name = "rejected_at")
    var rejectedAt: Instant? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(nullable = false)
    var version: Int = 0
)
