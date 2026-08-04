package eu.nt.xpenses.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant
import java.time.LocalDate
import eu.nt.xpenses.services.fx.FxRateSource

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

    @Column(name = "source_date", nullable = false)
    var sourceDate: LocalDate,

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    var source: FxRateSource,

    @Column(nullable = false)
    var rate: BigDecimal,

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.now()
)
