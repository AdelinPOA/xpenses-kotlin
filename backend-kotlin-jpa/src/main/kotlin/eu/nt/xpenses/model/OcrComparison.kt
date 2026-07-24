package eu.nt.xpenses.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

@Entity
@Table(name = "ocr_comparisons")
class OcrComparison(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @ManyToOne(fetch = FetchType.LAZY)
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

    @Column(name = "gemini_error")
    var geminiError: String? = null,

    @Column(name = "sha256")
    var sha256: String? = null,

    var provider: String = "gemini",

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
