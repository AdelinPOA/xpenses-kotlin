package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonManagedReference
import com.fasterxml.jackson.annotation.JsonProperty
import jakarta.persistence.*
import org.hibernate.annotations.SQLDelete
import org.hibernate.annotations.SQLRestriction
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "expense_reports")
@SQLDelete(sql = "UPDATE expense_reports SET deleted = true, deleted_at = NOW() WHERE id=? AND version=?")
@SQLRestriction("deleted = false")
class ExpenseReport(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    var user: User? = null,

    @Column(nullable = false)
    var title: String,

    var description: String? = null,

    @Column(name = "date_from")
    var dateFrom: String? = null,

    @Column(name = "date_to")
    var dateTo: String? = null,

    @Column(nullable = false)
    var status: String = "draft",

    @Column(name = "submitted_at")
    var submittedAt: Instant? = null,

    @Column(name = "paid_at")
    var paidAt: Instant? = null,

    @Column(name = "total_amount", nullable = false)
    var totalAmount: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false)
    var currency: String = "EUR",

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "signer_id")
    var signer: User? = null,

    @Column(name = "signed_at")
    var signedAt: Instant? = null,

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

    @Column(name = "rejected_reason")
    var rejectedReason: String? = null,

    @Version
    @Column(nullable = false)
    var version: Int = 0,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Column(nullable = false)
    var deleted: Boolean = false,

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,

    var kundenauftrag: String? = null,
    var auftragsart: String? = null,
    var positionstyp: String? = null,
    @JsonProperty("technplatz_raw") var technplatzRaw: String? = null,
    @JsonProperty("technplatz_line") var technplatzLine: Boolean = false,
    @JsonProperty("kunde_code") var kundeCode: String? = null,
    @JsonProperty("kunde_name") var kundeName: String? = null,
    var adresse: String? = null,
    var vorgang: String? = null,
    var arbeitsplatz: String? = null,
    var techniker: String? = null,

    @JsonManagedReference("report-expenses")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.PERSIST, CascadeType.MERGE], fetch = FetchType.LAZY)
    var expenses: MutableList<Expense> = mutableListOf(),

    @JsonManagedReference("report-advances")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var advances: MutableList<AdvancePayment> = mutableListOf(),

    @JsonManagedReference("report-mileage")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var mileageRecords: MutableList<MileageRecord> = mutableListOf()
)
