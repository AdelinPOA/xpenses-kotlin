package eu.nt.xpenses.models

import org.springframework.data.annotation.Id
import org.springframework.data.relational.core.mapping.Table
import java.time.Instant

@Table("categories")
data class Category(
    @Id val id: Int? = null,
    val name: String,
    val limitAmount: Double? = null,
    val isActive: Boolean = true,
    val createdAt: Instant = Instant.now()
)

@Table("users")
data class User(
    @Id val id: Int? = null,
    val username: String,
    val displayName: String,
    val email: String? = null,
    val passwordHash: String? = null,
    val authSource: String = "local",
    val role: String = "technician",
    val isActive: Boolean = true,
    val signaturePath: String? = null,
    val notificationsEnabled: Boolean = true,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now()
)

@Table("expense_reports")
data class ExpenseReport(
    @Id val id: Int? = null,
    val userId: Int?,
    val title: String,
    val description: String? = null,
    val dateFrom: String? = null,
    val dateTo: String? = null,
    val status: String = "draft",
    val submittedAt: Instant? = null,
    val paidAt: Instant? = null,
    val totalAmount: Double = 0.0,
    val currency: String = "EUR",
    val signerId: Int? = null,
    val signedAt: Instant? = null,
    val approvedBy: Int? = null,
    val approvedAt: Instant? = null,
    val rejectedReason: String? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now()
)

@Table("expenses")
data class Expense(
    @Id val id: Int? = null,
    val userId: Int?,
    val categoryId: Int?,
    val reportId: Int?,
    val amountOriginal: Double,
    val currencyOriginal: String = "EUR",
    val amountEur: Double,
    val fxRate: Double = 1.0,
    val taxAmount: Double = 0.0,
    val taxRate: Double? = null,
    val taxAmountEur: Double = 0.0,
    val date: String,
    val description: String? = null,
    val merchant: String? = null,
    val receiptPath: String? = null,
    val status: String = "draft",
    val rawOcrText: String? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now()
)

@Table("receipts")
data class Receipt(
    @Id val id: Int? = null,
    val expenseId: Int,
    val filePath: String,
    val originalName: String? = null,
    val createdAt: Instant = Instant.now()
)

@Table("fx_rates")
data class FxRate(
    @Id val id: Int? = null,
    val fromCurrency: String,
    val toCurrency: String,
    val rateDate: String,
    val rate: Double,
    val fetchedAt: Instant = Instant.now()
)

@Table("refresh_tokens")
data class RefreshToken(
    @Id val id: Int? = null,
    val userId: Int,
    val tokenHash: String,
    val expiresAt: Instant,
    val createdAt: Instant = Instant.now()
)

@Table("advance_payments")
data class AdvancePayment(
    @Id val id: Int? = null,
    val reportId: Int,
    val userId: Int,
    val amountOriginal: Double,
    val currencyOriginal: String = "EUR",
    val amountEur: Double,
    val fxRate: Double = 1.0,
    val date: String,
    val description: String? = null,
    val status: String = "paid",
    val requestedAmount: Double? = null,
    val requestedCurrency: String? = null,
    val paidBy: Int? = null,
    val paidAt: Instant? = null,
    val rejectedBy: Int? = null,
    val rejectedAt: Instant? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now()
)

@Table("mileage_records")
data class MileageRecord(
    @Id val id: Int? = null,
    val reportId: Int,
    val userId: Int,
    val origin: String,
    val destination: String,
    val distanceKm: Double,
    val rateBeforeTax: Double,
    val rateAfterTax: Double,
    val amountBeforeTax: Double,
    val amountEur: Double,
    val startTime: Instant,
    val endTime: Instant,
    val description: String? = null,
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now()
)

@Table("app_settings")
data class AppSetting(
    @Id val key: String,
    val value: String,
    val updatedAt: Instant = Instant.now()
)
