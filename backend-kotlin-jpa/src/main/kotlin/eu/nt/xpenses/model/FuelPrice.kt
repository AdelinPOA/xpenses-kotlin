package eu.nt.xpenses.model

import eu.nt.xpenses.services.fuel.FuelPriceSource
import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate

@Entity
@Table(name = "fuel_prices")
class FuelPrice(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Int? = null,

    @Column(name = "fuel_type", nullable = false, length = 20)
    var fuelType: String,

    @Column(name = "price_date", nullable = false, length = 10)
    var priceDate: String,

    @Column(name = "source_date", nullable = false)
    var sourceDate: LocalDate,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 32)
    var source: FuelPriceSource,

    @Column(name = "price_ron_per_liter", nullable = false, precision = 10, scale = 4)
    var priceRonPerLiter: BigDecimal,

    @Column(name = "station_count")
    var stationCount: Int? = null,

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.now(),
)
