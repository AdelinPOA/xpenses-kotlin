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

    @Column(name = "fuel_consumption_l_per_100km")
    var fuelConsumptionLitersPer100Km: BigDecimal? = null,

    @Column(name = "fuel_price_ron_per_liter")
    var fuelPriceRonPerLiter: BigDecimal? = null,

    @Column(name = "fuel_price_source", length = 32)
    var fuelPriceSource: String? = null,

    @Column(name = "fuel_exchange_rate")
    var fuelExchangeRate: BigDecimal? = null,

    @Column(name = "fuel_cost_eur")
    var fuelCostEur: BigDecimal? = null,

    @Column(name = "taxable_amount")
    var taxableAmount: BigDecimal? = null,

    @Column(name = "withholding_amount")
    var withholdingAmount: BigDecimal? = null,

    @Column(name = "pension_rate")
    var pensionRate: BigDecimal? = null,

    @Column(name = "health_rate")
    var healthRate: BigDecimal? = null,

    @Column(name = "income_tax_rate")
    var incomeTaxRate: BigDecimal? = null,

    @Column(name = "tax_deduction_eur")
    var taxDeductionEur: BigDecimal? = null,

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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "vehicle_id")
    var vehicle: UserVehicle? = null,

    @Column(name = "vehicle_plate", length = 32)
    var vehiclePlate: String? = null,

    @Column(name = "vehicle_make_model", length = 120)
    var vehicleMakeModel: String? = null,

    @Column(name = "vehicle_fuel_type", length = 20)
    var vehicleFuelType: String? = null,

    @Column(name = "vehicle_category", length = 16)
    var vehicleCategory: String? = null,

    @Column(name = "round_trip", nullable = false)
    var roundTrip: Boolean = false,

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now(),

    @Column(name = "updated_at", nullable = false)
    var updatedAt: Instant = Instant.now(),

    @Version
    @Column(nullable = false)
    var version: Int = 0
)
