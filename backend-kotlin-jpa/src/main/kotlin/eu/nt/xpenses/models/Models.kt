package eu.nt.xpenses.models

import com.fasterxml.jackson.annotation.JsonBackReference
import com.fasterxml.jackson.annotation.JsonIgnore
import com.fasterxml.jackson.annotation.JsonManagedReference
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "users")
class User(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(nullable = false, unique = true)
    var username: String,

    @Column(name = "display_name", nullable = false)
    var displayName: String,

    var email: String? = null,

    @field:JsonIgnore
    @Column(name = "password_hash")
    var passwordHash: String? = null,

    @Column(name = "auth_source", nullable = false)
    var authSource: String = "local",

    @Column(nullable = false)
    var role: String = "technician",

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "signature_path")
    var signaturePath: String? = null,

    @Column(name = "notifications_enabled", nullable = false)
    var notificationsEnabled: Boolean = true,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "categories")
class Category(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(nullable = false, unique = true)
    var name: String,

    @Column(name = "limit_amount")
    var limitAmount: Double? = null,

    @Column(name = "is_active", nullable = false)
    var isActive: Boolean = true,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "expense_reports")
class ExpenseReport(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.EAGER)
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
    var totalAmount: Double = 0.0,

    @Column(nullable = false)
    var currency: String = "EUR",

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "signer_id")
    var signer: User? = null,

    @Column(name = "signed_at")
    var signedAt: Instant? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "approved_by")
    var approvedBy: User? = null,

    @Column(name = "approved_at")
    var approvedAt: Instant? = null,

    @Column(name = "rejected_reason")
    var rejectedReason: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @JsonManagedReference("report-expenses")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var expenses: MutableList<Expense> = mutableListOf(),

    @JsonManagedReference("report-advances")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var advances: MutableList<AdvancePayment> = mutableListOf(),

    @JsonManagedReference("report-mileage")
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var mileageRecords: MutableList<MileageRecord> = mutableListOf()
)

@Entity
@Table(name = "expenses")
class Expense(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id")
    var user: User? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "category_id")
    var category: Category? = null,

    @JsonBackReference("report-expenses")
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "report_id")
    var report: ExpenseReport? = null,

    @Column(name = "amount_original", nullable = false)
    var amountOriginal: Double,

    @Column(name = "currency_original", nullable = false)
    var currencyOriginal: String = "EUR",

    @Column(name = "amount_eur", nullable = false)
    var amountEur: Double,

    @Column(name = "fx_rate", nullable = false)
    var fxRate: Double = 1.0,

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

    @JsonManagedReference("expense-receipts")
    @OneToMany(mappedBy = "expense", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var receipts: MutableList<Receipt> = mutableListOf()
)

@Entity
@Table(name = "receipts")
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
    var createdAt: Instant = Instant.now()
)

@Entity
@Table(name = "fx_rates")
class FxRate(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(name = "from_currency", nullable = false)
    var fromCurrency: String,

    @Column(name = "to_currency", nullable = false)
    var toCurrency: String,

    @Column(name = "rate_date", nullable = false)
    var rateDate: String,

    @Column(nullable = false)
    var rate: Double,

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.now()
)

@Entity
@Table(name = "refresh_tokens")
class RefreshToken(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(name = "token_hash", nullable = false)
    var tokenHash: String,

    @Column(name = "expires_at", nullable = false)
    var expiresAt: Instant,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)

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

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(name = "amount_original", nullable = false)
    var amountOriginal: Double,

    @Column(name = "currency_original", nullable = false)
    var currencyOriginal: String = "EUR",

    @Column(name = "amount_eur", nullable = false)
    var amountEur: Double,

    @Column(name = "fx_rate", nullable = false)
    var fxRate: Double = 1.0,

    @Column(nullable = false)
    var date: String,

    var description: String? = null,

    @Column(nullable = false)
    var status: String = "paid",

    @Column(name = "requested_amount")
    var requestedAmount: Double? = null,

    @Column(name = "requested_currency")
    var requestedCurrency: String? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "paid_by")
    var paidBy: User? = null,

    @Column(name = "paid_at")
    var paidAt: Instant? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "rejected_by")
    var rejectedBy: User? = null,

    @Column(name = "rejected_at")
    var rejectedAt: Instant? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)

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

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "user_id", nullable = false)
    var user: User,

    @Column(nullable = false)
    var origin: String,

    @Column(nullable = false)
    var destination: String,

    @Column(name = "distance_km", nullable = false)
    var distanceKm: Double,

    @Column(name = "rate_before_tax", nullable = false)
    var rateBeforeTax: Double,

    @Column(name = "rate_after_tax", nullable = false)
    var rateAfterTax: Double,

    @Column(name = "amount_before_tax", nullable = false)
    var amountBeforeTax: Double,

    @Column(name = "amount_eur", nullable = false)
    var amountEur: Double,

    @Column(name = "start_time", nullable = false)
    var startTime: Instant,

    @Column(name = "end_time", nullable = false)
    var endTime: Instant,

    var description: String? = null,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "app_settings")
class AppSetting(
    @Id
    var key: String,

    @Column(nullable = false)
    var value: String,

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now()
)

@Entity
@Table(name = "ocr_comparisons")
class OcrComparison(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "expense_id")
    var expense: Expense? = null,

    @Column(name = "receipt_filename")
    var receiptFilename: String? = null,

    @Column(name = "gemini_amount")
    var geminiAmount: BigDecimal? = null,

    @Column(name = "gemini_date")
    var geminiDate: String? = null,

    @Column(name = "gemini_merchant")
    var geminiMerchant: String? = null,

    @Column(name = "gemini_category_id")
    var geminiCategoryId: Int? = null,

    @Column(name = "easyocr_amount")
    var easyocrAmount: BigDecimal? = null,

    @Column(name = "easyocr_date")
    var easyocrDate: String? = null,

    @Column(name = "easyocr_merchant")
    var easyocrMerchant: String? = null,

    @Column(name = "easyocr_category_id")
    var easyocrCategoryId: Int? = null,

    @Column(name = "mineru_amount")
    var mineruAmount: BigDecimal? = null,

    @Column(name = "mineru_date")
    var mineruDate: String? = null,

    @Column(name = "mineru_merchant")
    var mineruMerchant: String? = null,

    @Column(name = "mineru_category_id")
    var mineruCategoryId: Int? = null,

    var provider: String = "gemini",

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
