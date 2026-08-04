package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonBackReference
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "mileage_records")
class MileageRecord(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @JsonBackReference("report-mileage")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id", nullable = false)
    var report: ExpenseReport,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(nullable = false)
    var origin: String,

    @Column(nullable = false)
    var destination: String,

    @Column(name = "distance_km", nullable = false)
    var distanceKm: Double,

    @Column(name = "rate_before_tax", nullable = false)
    var rateBeforeTax: BigDecimal,

    @Column(name = "rate_after_tax", nullable = false)
    var rateAfterTax: BigDecimal,

    @Column(name = "amount_before_tax", nullable = false)
    var amountBeforeTax: BigDecimal,

    @Column(name = "amount_eur", nullable = false)
    var amountEur: BigDecimal,

    @Column(name = "amount_original", nullable = false)
    var amountOriginal: BigDecimal,

    @Column(name = "currency_original", nullable = false, length = 3)
    var currencyOriginal: String,

    @Column(name = "fx_rate", nullable = false)
    var fxRate: BigDecimal,

    @Column(name = "start_time", nullable = false)
    var startTime: Instant,

    @Column(name = "end_time", nullable = false)
    var endTime: Instant,

    var description: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(nullable = false)
    var version: Int = 0
)
