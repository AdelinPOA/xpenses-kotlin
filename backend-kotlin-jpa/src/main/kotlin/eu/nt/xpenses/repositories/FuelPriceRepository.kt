package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.FuelPrice
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface FuelPriceRepository : JpaRepository<FuelPrice, Int> {
    fun findByFuelTypeAndPriceDate(
        fuelType: String,
        priceDate: String,
    ): FuelPrice?

    fun findTopByOrderByFetchedAtDesc(): FuelPrice?
}
