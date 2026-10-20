package eu.nt.xpenses.model

import com.fasterxml.jackson.annotation.JsonBackReference
import com.fasterxml.jackson.annotation.JsonManagedReference
import jakarta.persistence.*
import org.hibernate.annotations.SQLDelete
import org.hibernate.annotations.SQLRestriction
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "expenses")
@SQLDelete(sql = "UPDATE expenses SET deleted = true, deleted_at = NOW() WHERE id=? AND version=?")
@SQLRestriction("deleted = false")
class Expense(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id")
    var user: User? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "category_id")
    var category: Category? = null,

    @JsonBackReference("report-expenses")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id")
    var report: ExpenseReport? = null,

    @Column(name = "amount_original", nullable = false)
    var amountOriginal: BigDecimal,

    @Column(name = "currency_original", nullable = false)
    var currencyOriginal: String = "EUR",

    @Column(name = "amount_eur", nullable = false)
    var amountEur: BigDecimal,

    @Column(name = "fx_rate", nullable = false)
    var fxRate: BigDecimal = BigDecimal.ONE,

    @Column(name = "fx_rate_manual", nullable = false)
    var fxRateManual: Boolean = false,

    @Column(name = "tax_amount", nullable = false)
    var taxAmount: BigDecimal = BigDecimal.ZERO,

    @Column(name = "tax_rate")
    var taxRate: BigDecimal? = null,

    @Column(name = "tax_amount_eur", nullable = false)
    var taxAmountEur: BigDecimal = BigDecimal.ZERO,

    @Column(nullable = false)
    var date: String,

    var description: String? = null,

    var merchant: String? = null,

    @Column(name = "receipt_path")
    var receiptPath: String? = null,

    @Column(nullable = false)
    var status: String = "draft",

    @Column(name = "raw_ocr_text")
    var rawOcrText: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(nullable = false)
    var version: Int = 0,

    @Enumerated(EnumType.STRING)
    @Column(name = "verification_state", nullable = false, length = 20)
    var verificationState: ExpenseVerificationState = ExpenseVerificationState.NOT_REQUIRED,

    @Column(name = "last_verified_at")
    var lastVerifiedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "last_verified_by_user_id")
    var lastVerifiedBy: User? = null,

    @Column(nullable = false)
    var deleted: Boolean = false,

    @Column(name = "deleted_at")
    var deletedAt: Instant? = null,

    @JsonManagedReference("expense-receipts")
    @OneToMany(mappedBy = "expense", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var receipts: MutableList<Receipt> = mutableListOf()
)
