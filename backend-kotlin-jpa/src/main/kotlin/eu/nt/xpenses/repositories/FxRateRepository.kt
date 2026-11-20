package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.FxRate
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface FxRateRepository : JpaRepository<FxRate, Int> {
    fun findByFromCurrencyAndToCurrencyAndRateDate(
        fromCurrency: String,
        toCurrency: String,
        rateDate: String
    ): FxRate?

    fun findTopByOrderByFetchedAtDesc(): FxRate?
}
