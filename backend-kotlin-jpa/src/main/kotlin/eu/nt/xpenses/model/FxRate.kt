package eu.nt.xpenses.model

import jakarta.persistence.*
import java.math.BigDecimal
import java.time.Instant

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
    var rate: BigDecimal,

    @Column(name = "fetched_at", nullable = false)
    var fetchedAt: Instant = Instant.now()
)
