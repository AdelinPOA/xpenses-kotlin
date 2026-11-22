package eu.nt.xpenses.mileage

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.controllers.ReportOwnership
import eu.nt.xpenses.dto.report.MileageRecordCreate
import eu.nt.xpenses.dto.report.MileageRecordUpdate
import eu.nt.xpenses.dto.vehicle.UserVehicleCreate
import eu.nt.xpenses.dto.vehicle.UserVehicleUpdate
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.FuelPrice
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.FuelPriceRepository
import eu.nt.xpenses.repositories.MileageRecordRepository
import eu.nt.xpenses.repositories.UserVehicleRepository
import eu.nt.xpenses.services.fuel.FuelPriceSource
import eu.nt.xpenses.services.fuel.ResolvedFuelPrice
import jakarta.persistence.EntityManager
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.`when`
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.math.RoundingMode
import java.time.Instant
import java.time.LocalDate

class VehicleMileageTest : IntegrationTestBase() {

    @Autowired
    private lateinit var vehicleMileage: VehicleMileage

    @Autowired
    private lateinit var mileageRecordRepository: MileageRecordRepository

    @Autowired
    private lateinit var userVehicleRepository: UserVehicleRepository

    @Autowired
    private lateinit var fuelPriceRepository: FuelPriceRepository

    @Autowired
    private lateinit var reportOwnership: ReportOwnership

    @Autowired
    private lateinit var entityManager: EntityManager

    private val defaultStart = Instant.parse("2026-06-01T08:00:00Z")
    private val defaultEnd = Instant.parse("2026-06-01T09:30:00Z")

    private fun user(username: String): User = userRepository.findByUsername(username)!!

    private fun makeReport(username: String = "tech1", status: String = "draft", startingOdometerKm: BigDecimal? = null): ExpenseReport =
        expenseReportRepository.save(
            ExpenseReport(
                user = user(username),
                title = "Mileage Module Report",
                status = status,
                startingOdometerKm = startingOdometerKm,
            )
        )

    private fun flushAndClear() {
        entityManager.flush()
        entityManager.clear()
    }

    private fun makeModule(
        fxRateLookup: (String, String) -> BigDecimal = { _, _ -> BigDecimal("0.2") },
        fuelPriceLookup: (String?, LocalDate) -> ResolvedFuelPrice = { fuelType, date ->
            ResolvedFuelPrice(
                priceRonPerLiter = BigDecimal("9.20"),
                sourceDate = date,
                source = FuelPriceSource.MANUAL_SETTING,
                fuelType = fuelType ?: "default",
            )
        },
        rates: MileageRatesConfig = MileageRatesConfig(
            grossRate = BigDecimal("0.60"),
            defaultFuelConsumption = BigDecimal("7.5"),
            defaultFuelPriceRonPerLiter = BigDecimal("9.20"),
            pensionRate = BigDecimal("0.25"),
            healthRate = BigDecimal("0.10"),
            incomeTaxRate = BigDecimal("0.10"),
            taxDeductionEur = BigDecimal("0.00"),
        ),
    ): VehicleMileage = VehicleMileage(
        mileageRecordRepository = mileageRecordRepository,
        userVehicleRepository = userVehicleRepository,
        expenseReportRepository = expenseReportRepository,
        userRepository = userRepository,
        reportOwnership = reportOwnership,
        fxRatePort = MileageFxRatePort(fxRateLookup),
        fuelPricePort = MileageFuelPricePort(fuelPriceLookup),
        ratesConfigPort = MileageRatesConfigPort { rates },
        companyName = "Newtech Automation",
    )

    @Test
    fun `createMileage matches workbook fuel and withholding calculation to 6 decimal places`() {
        val report = makeReport()
        val ronToEur = BigDecimal.ONE.divide(BigDecimal("5.09"), 12, RoundingMode.HALF_UP)
        val module = makeModule(fxRateLookup = { currency, _ ->
            assertEquals("RON", currency)
            ronToEur
        })

        val out = module.createMileage(
            report.id!!,
            MileageRecordCreate(
                origin = "Office",
                destination = "Client",
                distanceKm = 670.0,
                startTime = defaultStart,
                endTime = defaultEnd,
            ),
            user("tech1"),
        )

        assertEquals(BigDecimal("402.00"), out.amountBeforeTax)
        assertEquals(BigDecimal("90.825147"), out.fuelCostEur!!.setScale(6, RoundingMode.HALF_UP))
        assertEquals(BigDecimal("311.174853"), out.taxableAmount!!.setScale(6, RoundingMode.HALF_UP))
        assertEquals(BigDecimal("129.137564"), out.withholdingAmount!!.setScale(6, RoundingMode.HALF_UP))
        assertEquals(BigDecimal("272.86"), out.amountOriginal)
        assertEquals(BigDecimal("272.86"), out.amountEur)
        assertEquals(BigDecimal("0.407257"), out.rateAfterTax.setScale(6, RoundingMode.HALF_UP))
    }

    @Test
    fun `createMileage resolves UTC business date and maps FX errors to 502`() {
        val report = makeReport()
        val capturedDates = mutableListOf<String>()
        val module = makeModule(fxRateLookup = { currency, date ->
            assertEquals("RON", currency)
            capturedDates.add(date)
            BigDecimal("0.1964636542")
        })

        val out = module.createMileage(
            report.id!!,
            MileageRecordCreate(
                origin = "Office",
                destination = "Client",
                distanceKm = 50.0,
                startTime = Instant.parse("2026-06-01T00:30:00+03:00"),
                endTime = Instant.parse("2026-06-01T02:00:00+03:00"),
            ),
            user("tech1"),
        )

        assertEquals(listOf("2026-05-31"), capturedDates)
        assertEquals(BigDecimal("20.36"), out.amountOriginal)
        assertEquals("EUR", out.currencyOriginal)
        assertEquals(BigDecimal.ONE, out.fxRate)
        assertEquals(BigDecimal("20.36"), out.amountEur)

        val failingModule = makeModule(fxRateLookup = { _, _ -> error("upstream timeout") })
        val exFail = assertThrows<ResponseStatusException> {
            failingModule.createMileage(
                report.id!!,
                MileageRecordCreate("A", "B", 10.0, defaultStart, defaultEnd),
                user("tech1"),
            )
        }
        assertEquals(HttpStatus.BAD_GATEWAY, exFail.statusCode)

        val nonPositiveModule = makeModule(fxRateLookup = { _, _ -> BigDecimal.ZERO })
        val exZero = assertThrows<ResponseStatusException> {
            nonPositiveModule.createMileage(
                report.id!!,
                MileageRecordCreate("A", "B", 10.0, defaultStart, defaultEnd),
                user("tech1"),
            )
        }
        assertEquals(HttpStatus.BAD_GATEWAY, exZero.statusCode)
    }

    @Test
    fun `listMileage and unrelated updateMileage preserve snapshot without calling FX or fuel ports`() {
        val report = makeReport()
        var fxCalls = 0
        var fuelCalls = 0
        val module = makeModule(
            fxRateLookup = { _, _ ->
                fxCalls++
                BigDecimal.ONE
            },
            fuelPriceLookup = { fuelType, date ->
                fuelCalls++
                ResolvedFuelPrice(BigDecimal("9.20"), date, FuelPriceSource.MANUAL_SETTING, fuelType ?: "default")
            },
        )

        val created = module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
            user("tech1"),
        )
        assertEquals(1, fxCalls)
        assertEquals(1, fuelCalls)

        val listed = module.listMileage(report.id!!, user("tech1"))
        assertEquals(1, listed.size)
        assertEquals("EUR", listed[0].currencyOriginal)
        assertEquals(BigDecimal.ONE, listed[0].fxRate)
        assertEquals(1, fxCalls)
        assertEquals(1, fuelCalls)

        val updated = module.updateMileage(
            report.id!!,
            created.id,
            MileageRecordUpdate(origin = "New Office", description = "Updated"),
            user("tech1"),
        )
        assertEquals("New Office", updated.origin)
        assertEquals(BigDecimal.ONE, updated.fxRate)
        assertEquals(1, fxCalls)
        assertEquals(1, fuelCalls)
    }

    @Test
    fun `changing mileage UTC business date resolves a fresh FX and fuel snapshot`() {
        val report = makeReport()
        val seenDates = mutableListOf<String>()
        val module = makeModule(fxRateLookup = { _, date ->
            seenDates.add(date)
            if (date == "2026-06-02") BigDecimal("0.1964") else BigDecimal.ONE
        })

        val created = module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
            user("tech1"),
        )

        val updated = module.updateMileage(
            report.id!!,
            created.id,
            MileageRecordUpdate(
                startTime = Instant.parse("2026-06-02T08:00:00Z"),
                endTime = Instant.parse("2026-06-02T09:30:00Z"),
            ),
            user("tech1"),
        )

        assertEquals(listOf("2026-06-01", "2026-06-02"), seenDates)
        assertEquals(BigDecimal.ONE, updated.fxRate)
        assertEquals(BigDecimal("20.36"), updated.amountEur)
    }

    @Test
    fun `mileage guards enforce draft status, report ownership, valid times, and report membership`() {
        val draftReport = makeReport("tech1", status = "draft")
        val submittedReport = makeReport("tech1", status = "submitted")
        val tech2 = userRepository.save(User(username = "tech2_mod", displayName = "Tech 2", role = "technician", isActive = true))
        val module = makeModule()

        val created = module.createMileage(
            draftReport.id!!,
            MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
            user("tech1"),
        )

        // Non-draft rejected with 400
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> {
                module.createMileage(
                    submittedReport.id!!,
                    MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
                    user("tech1"),
                )
            }.statusCode,
        )

        // Unrelated technician cannot list or modify (403)
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> {
                module.listMileage(draftReport.id!!, tech2)
            }.statusCode,
        )
        // Manager can view, cannot modify another user's draft (403)
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> {
                module.createMileage(
                    draftReport.id!!,
                    MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
                    user("manager1"),
                )
            }.statusCode,
        )

        // end_time <= start_time rejected with 422
        assertEquals(
            HttpStatus.UNPROCESSABLE_CONTENT,
            assertThrows<ResponseStatusException> {
                module.createMileage(
                    draftReport.id!!,
                    MileageRecordCreate("Office", "Client", 50.0, defaultEnd, defaultStart),
                    user("tech1"),
                )
            }.statusCode,
        )
        assertEquals(
            HttpStatus.UNPROCESSABLE_CONTENT,
            assertThrows<ResponseStatusException> {
                module.updateMileage(
                    draftReport.id!!,
                    created.id,
                    MileageRecordUpdate(startTime = defaultStart, endTime = defaultStart),
                    user("tech1"),
                )
            }.statusCode,
        )

        // Wrong report or missing record -> 404
        val otherReport = makeReport("tech1", status = "draft")
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.updateMileage(otherReport.id!!, created.id, MileageRecordUpdate(origin = "X"), user("tech1"))
            }.statusCode,
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.deleteMileage(otherReport.id!!, created.id, user("tech1"))
            }.statusCode,
        )

        module.deleteMileage(draftReport.id!!, created.id, user("tech1"))
        assertTrue(module.listMileage(draftReport.id!!, user("tech1")).isEmpty())
    }

    @Test
    fun `vehicle snapshot, consumption override, switching, clearing, and ownership are enforced`() {
        val report = makeReport("tech1")
        val module = makeModule()

        val vCustom = module.createVehicle(
            UserVehicleCreate(
                plateNumber = "B-99-TST",
                makeModel = "Skoda Octavia",
                fuelType = "diesel",
                fuelConsumptionLitersPer100Km = BigDecimal("6.0"),
            ),
            user("tech1"),
        )
        val vNoConsumption = module.createVehicle(
            UserVehicleCreate(
                plateNumber = "B-55-DEF",
                makeModel = "Dacia Logan",
                fuelType = "petrol",
                fuelConsumptionLitersPer100Km = null,
            ),
            user("tech1"),
        )
        val vOtherFuel = module.createVehicle(
            UserVehicleCreate(
                plateNumber = "B-22-BBB",
                makeModel = "Ford Ranger",
                fuelType = "petrol",
                fuelConsumptionLitersPer100Km = BigDecimal("9.0"),
            ),
            user("tech1"),
        )
        val managerVehicle = module.createVehicle(
            UserVehicleCreate(plateNumber = "B-88-MGR", makeModel = "BMW 320d", fuelType = "diesel"),
            user("manager1"),
        )

        // 6.0 L/100km -> 6.0 * 9.20 / 5.0 = 11.04 EUR
        val created = module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 100.0, defaultStart, defaultEnd, vehicleId = vCustom.id),
            user("tech1"),
        )
        assertEquals(vCustom.id, created.vehicleId)
        assertEquals("B-99-TST", created.vehiclePlate)
        assertEquals("Skoda Octavia", created.vehicleMakeModel)
        assertEquals("diesel", created.vehicleFuelType)
        assertEquals(BigDecimal("6.00"), created.fuelConsumptionLitersPer100Km!!.setScale(2))
        assertEquals(BigDecimal("11.04"), created.fuelCostEur!!.setScale(2, RoundingMode.HALF_UP))

        // Vehicle lacking consumption falls back to global 7.5 -> 13.80 EUR
        val fallbackOut = module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 100.0, defaultStart, defaultEnd, vehicleId = vNoConsumption.id),
            user("tech1"),
        )
        assertEquals(BigDecimal("7.5"), fallbackOut.fuelConsumptionLitersPer100Km!!.stripTrailingZeros())
        assertEquals(BigDecimal("13.80"), fallbackOut.fuelCostEur!!.setScale(2, RoundingMode.HALF_UP))

        // Another user's vehicle -> 404 on create and update
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.createMileage(
                    report.id!!,
                    MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd, vehicleId = managerVehicle.id),
                    user("tech1"),
                )
            }.statusCode,
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.updateMileage(report.id!!, created.id, MileageRecordUpdate(vehicleId = managerVehicle.id), user("tech1"))
            }.statusCode,
        )

        // Switch vehicle -> 9.0 L/100km -> 16.56 EUR
        val switched = module.updateMileage(
            report.id!!,
            created.id,
            MileageRecordUpdate(vehicleId = vOtherFuel.id),
            user("tech1"),
        )
        assertEquals(vOtherFuel.id, switched.vehicleId)
        assertEquals("B-22-BBB", switched.vehiclePlate)
        assertEquals("Ford Ranger", switched.vehicleMakeModel)
        assertEquals("petrol", switched.vehicleFuelType)
        assertEquals(BigDecimal("9.00"), switched.fuelConsumptionLitersPer100Km!!.setScale(2))
        assertEquals(BigDecimal("16.56"), switched.fuelCostEur!!.setScale(2, RoundingMode.HALF_UP))

        // Clear vehicle -> null snapshot, global 7.5 -> 13.80 EUR
        val cleared = module.updateMileage(
            report.id!!,
            created.id,
            MileageRecordUpdate(clearVehicle = true),
            user("tech1"),
        )
        assertNull(cleared.vehicleId)
        assertNull(cleared.vehiclePlate)
        assertNull(cleared.vehicleMakeModel)
        assertNull(cleared.vehicleFuelType)
        assertEquals(BigDecimal("7.5"), cleared.fuelConsumptionLitersPer100Km!!.stripTrailingZeros())
        assertEquals(BigDecimal("13.80"), cleared.fuelCostEur!!.setScale(2, RoundingMode.HALF_UP))
    }

    @Test
    fun `editing or deleting vehicle preserves snapshot on existing mileage records`() {
        val report = makeReport("tech1")
        val module = makeModule()

        val vehicle = module.createVehicle(
            UserVehicleCreate(
                plateNumber = "B-77-OLD",
                makeModel = "Renault Megane",
                fuelType = "diesel",
                fuelConsumptionLitersPer100Km = BigDecimal("6.0"),
            ),
            user("tech1"),
        )
        module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 100.0, defaultStart, defaultEnd, vehicleId = vehicle.id),
            user("tech1"),
        )

        module.updateVehicle(
            vehicle.id,
            UserVehicleUpdate(plateNumber = "B-77-NEW", fuelConsumptionLitersPer100Km = BigDecimal("10.0")),
            user("tech1"),
        )
        flushAndClear()

        module.deleteVehicle(vehicle.id, user("tech1"))
        flushAndClear()

        val records = module.listMileage(report.id!!, user("tech1"))
        assertEquals(1, records.size)
        assertNull(records[0].vehicleId)
        assertEquals("B-77-OLD", records[0].vehiclePlate)
        assertEquals("Renault Megane", records[0].vehicleMakeModel)
        assertEquals("diesel", records[0].vehicleFuelType)
        assertEquals(BigDecimal("6.00"), records[0].fuelConsumptionLitersPer100Km!!.setScale(2))
    }

    @Test
    fun `roundTrip and vehicleCategory N1 persist without doubling distanceKm and toggle cleanly`() {
        val report = makeReport("tech1")
        val module = makeModule()
        val vehicle = module.createVehicle(
            UserVehicleCreate(plateNumber = "B-10-N1", makeModel = "Ford Transit", fuelType = "diesel", vehicleCategory = "N1"),
            user("tech1"),
        )

        val created = module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd, vehicleId = vehicle.id, roundTrip = true),
            user("tech1"),
        )
        assertEquals(50.0, created.distanceKm)
        assertTrue(created.roundTrip)
        assertEquals("N1", created.vehicleCategory)

        val updated = module.updateMileage(report.id!!, created.id, MileageRecordUpdate(roundTrip = false), user("tech1"))
        assertEquals(50.0, updated.distanceKm)
        assertFalse(updated.roundTrip)
    }

    @Test
    fun `legacy mileage record without fuel fields updates via legacy EUR FX fallback`() {
        val report = makeReport("tech1")
        val legacy = mileageRecordRepository.save(
            MileageRecord(
                report = report,
                user = user("tech1"),
                origin = "Legacy A",
                destination = "Legacy B",
                distanceKm = 100.0,
                rateBeforeTax = BigDecimal("0.60"),
                rateAfterTax = BigDecimal("0.40"),
                amountBeforeTax = BigDecimal("60.00"),
                amountOriginal = BigDecimal("40.00"),
                amountEur = BigDecimal("40.00"),
                currencyOriginal = "EUR",
                fxRate = BigDecimal.ONE,
                startTime = defaultStart,
                endTime = defaultEnd,
            )
        )
        val module = makeModule(fxRateLookup = { currency, date ->
            assertEquals("EUR", currency)
            assertEquals("2026-06-05", date)
            BigDecimal("1.25")
        })

        val updated = module.updateMileage(
            report.id!!,
            legacy.id!!,
            MileageRecordUpdate(
                distanceKm = 150.0,
                startTime = Instant.parse("2026-06-05T08:00:00Z"),
                endTime = Instant.parse("2026-06-05T10:00:00Z"),
            ),
            user("tech1"),
        )

        assertEquals(BigDecimal("90.00"), updated.amountBeforeTax)
        assertEquals(BigDecimal("60.00"), updated.amountOriginal)
        assertEquals(BigDecimal("1.25"), updated.fxRate)
        assertEquals(BigDecimal("75.00"), updated.amountEur)
    }

    @Test
    fun `spring wired VehicleMileage resolves cached daily FuelPrice for vehicle fuel type`() {
        val report = makeReport("tech1")
        fuelPriceRepository.save(
            FuelPrice(
                fuelType = "diesel",
                priceDate = "2026-06-01",
                sourceDate = LocalDate.parse("2026-06-01"),
                source = FuelPriceSource.PRETCARBURANT_DATA,
                priceRonPerLiter = BigDecimal("10.50"),
                stationCount = 1350,
            )
        )
        flushAndClear()

        `when`(fxService.getRate("RON", "2026-06-01")).thenReturn(BigDecimal("0.2"))

        val vehicle = vehicleMileage.createVehicle(
            UserVehicleCreate(
                plateNumber = "B-77-DSL",
                makeModel = "VW Passat",
                fuelType = "diesel",
                fuelConsumptionLitersPer100Km = BigDecimal("6.0"),
            ),
            user("tech1"),
        )

        // 100 km * 6.0 L/100km = 6.0 L * 10.50 RON/L = 63.0 RON / 5.0 = 12.60 EUR
        val created = vehicleMileage.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 100.0, defaultStart, defaultEnd, vehicleId = vehicle.id),
            user("tech1"),
        )
        assertEquals(BigDecimal("10.50"), created.fuelPriceRonPerLiter!!.setScale(2))
        assertEquals("PRETCARBURANT_DATA", created.fuelPriceSource)
        assertEquals(BigDecimal("12.60"), created.fuelCostEur!!.setScale(2, RoundingMode.HALF_UP))
    }

    @Test
    fun `vehicle lifecycle enforces single default, oldest promotion on delete, clears, and isolation`() {
        val module = makeModule()

        val first = module.createVehicle(
            UserVehicleCreate(
                plateNumber = " b 100 aaa ",
                makeModel = "Skoda Octavia",
                fuelType = "petrol",
                fuelConsumptionLitersPer100Km = BigDecimal("7.2"),
            ),
            user("tech1"),
        )
        assertEquals("B 100 AAA", first.plateNumber)
        assertEquals("M1", first.vehicleCategory)
        assertTrue(first.isDefault)

        val second = module.createVehicle(
            UserVehicleCreate(
                plateNumber = "cj 200 bbb",
                makeModel = "VW Golf",
                fuelType = "diesel",
                vehicleCategory = " n1 ",
                isDefault = true,
            ),
            user("tech1"),
        )
        assertEquals("CJ 200 BBB", second.plateNumber)
        assertEquals("N1", second.vehicleCategory)
        assertTrue(second.isDefault)

        val ordered = module.listVehicles(user("tech1"))
        assertEquals(listOf(second.id, first.id), ordered.map { it.id })
        assertFalse(ordered[1].isDefault)

        // Cannot directly unset active default
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> {
                module.updateVehicle(second.id, UserVehicleUpdate(isDefault = false), user("tech1"))
            }.statusCode,
        )

        // Switch default back to first and clear optional fields
        val updatedFirst = module.updateVehicle(
            first.id,
            UserVehicleUpdate(
                makeModel = "Dacia Jogger",
                isDefault = true,
                clearFuelConsumption = true,
            ),
            user("tech1"),
        )
        assertTrue(updatedFirst.isDefault)
        assertEquals("Dacia Jogger", updatedFirst.makeModel)
        assertNull(updatedFirst.fuelConsumptionLitersPer100Km)

        // Clear make_model, fuel_type, last_odometer
        val withOdo = module.updateVehicle(
            first.id,
            UserVehicleUpdate(lastOdometerKm = BigDecimal("12345.6")),
            user("tech1"),
        )
        assertEquals(BigDecimal("12345.6"), withOdo.lastOdometerKm)
        val clearedFields = module.updateVehicle(
            first.id,
            UserVehicleUpdate(clearMakeModel = true, clearFuelType = true, clearLastOdometer = true),
            user("tech1"),
        )
        assertNull(clearedFields.makeModel)
        assertNull(clearedFields.fuelType)
        assertNull(clearedFields.lastOdometerKm)

        // Deleting default promotes remaining vehicle
        module.deleteVehicle(first.id, user("tech1"))
        val remaining = module.listVehicles(user("tech1"))
        assertEquals(1, remaining.size)
        assertEquals(second.id, remaining[0].id)
        assertTrue(remaining[0].isDefault)

        // Ownership isolation & unauthenticated actor
        assertTrue(module.listVehicles(user("manager1")).isEmpty())
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.updateVehicle(second.id, UserVehicleUpdate(makeModel = "Hijacked"), user("manager1"))
            }.statusCode,
        )
        assertEquals(
            HttpStatus.NOT_FOUND,
            assertThrows<ResponseStatusException> {
                module.deleteVehicle(second.id, user("manager1"))
            }.statusCode,
        )
        assertEquals(
            HttpStatus.UNAUTHORIZED,
            assertThrows<ResponseStatusException> {
                module.listVehicles(User(username = "anon", displayName = "Anonymous"))
            }.statusCode,
        )
    }

    @Test
    fun `vehicle validation rejects invalid plate, fuel type, consumption, makeModel, category, and odometer`() {
        val module = makeModule()
        val created = module.createVehicle(UserVehicleCreate(plateNumber = "B 123 ABC"), user("tech1"))

        val invalidCreates = listOf(
            UserVehicleCreate(plateNumber = "   "),
            UserVehicleCreate(plateNumber = "A".repeat(33)),
            UserVehicleCreate(plateNumber = "B 123 ABC", makeModel = "M".repeat(121)),
            UserVehicleCreate(plateNumber = "B 123 ABC", fuelType = "nuclear"),
            UserVehicleCreate(plateNumber = "B 123 ABC", fuelConsumptionLitersPer100Km = BigDecimal.ZERO),
            UserVehicleCreate(plateNumber = "B 123 ABC", fuelConsumptionLitersPer100Km = BigDecimal("55")),
            UserVehicleCreate(plateNumber = "B 123 ABC", fuelConsumptionLitersPer100Km = BigDecimal("0.001")),
            UserVehicleCreate(plateNumber = "B 123 ABC", fuelConsumptionLitersPer100Km = BigDecimal("6.555")),
            UserVehicleCreate(plateNumber = "B 123 ABC", vehicleCategory = "C".repeat(17)),
            UserVehicleCreate(plateNumber = "B 123 ABC", lastOdometerKm = BigDecimal("-1")),
        )
        for (req in invalidCreates) {
            assertEquals(
                HttpStatus.BAD_REQUEST,
                assertThrows<ResponseStatusException> { module.createVehicle(req, user("tech1")) }.statusCode,
            )
        }

        val invalidUpdates = listOf(
            UserVehicleUpdate(plateNumber = "   "),
            UserVehicleUpdate(makeModel = "M".repeat(121)),
            UserVehicleUpdate(fuelType = "rocket"),
            UserVehicleUpdate(fuelConsumptionLitersPer100Km = BigDecimal("50.01")),
            UserVehicleUpdate(vehicleCategory = "   "),
            UserVehicleUpdate(vehicleCategory = "C".repeat(17)),
            UserVehicleUpdate(lastOdometerKm = BigDecimal("375000.55")),
            UserVehicleUpdate(lastOdometerKm = BigDecimal("10000000.0")),
        )
        for (req in invalidUpdates) {
            assertEquals(
                HttpStatus.BAD_REQUEST,
                assertThrows<ResponseStatusException> { module.updateVehicle(created.id, req, user("tech1")) }.statusCode,
            )
        }
    }

    @Test
    fun `odometer validation and advancePrimaryVehicleOdometer advance monotonically for primary vehicle only`() {
        val module = makeModule()

        assertEquals(BigDecimal("375000.0"), module.validateAndNormalizeOdometerKm(BigDecimal("375000")))
        assertEquals(BigDecimal("0.0"), module.validateAndNormalizeOdometerKm(BigDecimal.ZERO))
        assertEquals(BigDecimal("9999999.9"), module.validateAndNormalizeOdometerKm(BigDecimal("9999999.9")))
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> { module.validateAndNormalizeOdometerKm(BigDecimal("-0.1")) }.statusCode,
        )
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> { module.validateAndNormalizeOdometerKm(BigDecimal("375000.55")) }.statusCode,
        )
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> { module.validateAndNormalizeOdometerKm(BigDecimal("10000000.0")) }.statusCode,
        )

        val vehicleA = module.createVehicle(
            UserVehicleCreate(plateNumber = "B-100-AAA", fuelType = "diesel", lastOdometerKm = BigDecimal("100000.0")),
            user("tech1"),
        )
        val vehicleB = module.createVehicle(
            UserVehicleCreate(plateNumber = "B-200-BBB", fuelType = "petrol", lastOdometerKm = BigDecimal("200000.0")),
            user("tech1"),
        )

        val report1 = makeReport("tech1", startingOdometerKm = BigDecimal("100000.0"))
        module.createMileage(
            report1.id!!,
            MileageRecordCreate("Office", "Client A", 100.0, Instant.parse("2026-06-01T08:00:00Z"), Instant.parse("2026-06-01T09:30:00Z"), vehicleId = vehicleA.id),
            user("tech1"),
        )
        module.createMileage(
            report1.id!!,
            MileageRecordCreate("Office", "Client B", 250.0, Instant.parse("2026-06-02T08:00:00Z"), Instant.parse("2026-06-02T11:30:00Z"), vehicleId = vehicleB.id),
            user("tech1"),
        )

        module.advancePrimaryVehicleOdometer(report1.id!!, report1.startingOdometerKm)
        flushAndClear()

        val after1 = module.listVehicles(user("tech1")).associateBy { it.id }
        assertEquals(BigDecimal("100100.0"), after1[vehicleA.id]!!.lastOdometerKm)
        assertEquals(BigDecimal("200000.0"), after1[vehicleB.id]!!.lastOdometerKm)

        // Lower ending odometer never regresses
        val report2 = makeReport("tech1", startingOdometerKm = BigDecimal("90000.0"))
        module.createMileage(
            report2.id!!,
            MileageRecordCreate("Office", "Client C", 50.0, defaultStart, defaultEnd, vehicleId = vehicleA.id),
            user("tech1"),
        )
        module.advancePrimaryVehicleOdometer(report2.id!!, report2.startingOdometerKm)
        flushAndClear()
        assertEquals(
            BigDecimal("100100.0"),
            module.listVehicles(user("tech1")).first { it.id == vehicleA.id }.lastOdometerKm,
        )

        // Edge skips: null starting odometer, no vehicle on primary trip, or > MAX_ODOMETER_KM
        module.advancePrimaryVehicleOdometer(report1.id!!, null)
        module.advancePrimaryVehicleOdometer(report1.id!!, BigDecimal("9999999.0"))
        flushAndClear()
        assertEquals(
            BigDecimal("100100.0"),
            module.listVehicles(user("tech1")).first { it.id == vehicleA.id }.lastOdometerKm,
        )
    }

    @Test
    fun `exportTripSheet generates workbook for owner and manager and enforces non-empty and access guards`() {
        val report = makeReport("tech1")
        val tech2 = userRepository.save(User(username = "tech2_sheet", displayName = "Tech 2", role = "technician", isActive = true))
        val module = makeModule()

        // Empty -> 400
        assertEquals(
            HttpStatus.BAD_REQUEST,
            assertThrows<ResponseStatusException> { module.exportTripSheet(report.id!!, user("tech1")) }.statusCode,
        )

        module.createMileage(
            report.id!!,
            MileageRecordCreate("Office", "Client", 50.0, defaultStart, defaultEnd),
            user("tech1"),
        )

        // Unrelated technician -> 403
        assertEquals(
            HttpStatus.FORBIDDEN,
            assertThrows<ResponseStatusException> { module.exportTripSheet(report.id!!, tech2) }.statusCode,
        )

        val ownerDownload = module.exportTripSheet(report.id!!, user("tech1"))
        assertTrue(ownerDownload.filename.startsWith("foaie_parcurs_raport_${report.id}_"))
        assertTrue(ownerDownload.filename.endsWith(".xlsx"))
        XSSFWorkbook(ByteArrayInputStream(ownerDownload.bytes)).use { wb ->
            assertEquals(1, wb.numberOfSheets)
            assertEquals("Iunie", wb.getSheetAt(0).sheetName)
        }

        val managerDownload = module.exportTripSheet(report.id!!, user("manager1"))
        assertTrue(managerDownload.bytes.isNotEmpty())
    }
}
