package eu.nt.xpenses.services

import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.MileageRecord
import eu.nt.xpenses.model.User
import org.apache.poi.ss.usermodel.CellType
import org.apache.poi.ss.usermodel.PrintSetup
import org.apache.poi.ss.util.CellRangeAddress
import org.apache.poi.xssf.usermodel.XSSFWorkbook
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import java.io.ByteArrayInputStream
import java.math.BigDecimal
import java.time.Instant

class TripSheetExportServiceTest {

    private val service = TripSheetExportService(companyName = "Newtech Automation")

    private fun makeUser(id: Int = 1, username: String = "ion.popescu", displayName: String = "Ion Popescu"): User =
        User(id = id, username = username, displayName = displayName)

    private fun makeReport(
        id: Int = 42,
        user: User = makeUser(),
        title: String = "Heineken Hrvatska",
        kundenauftrag: String? = "KA-2026-100",
        startingOdometerKm: BigDecimal? = BigDecimal("375000.0"),
        approvedBy: User? = makeUser(id = 2, username = "manager1", displayName = "Maria Ionescu")
    ): ExpenseReport = ExpenseReport(
        id = id,
        user = user,
        title = title,
        kundenauftrag = kundenauftrag,
        startingOdometerKm = startingOdometerKm,
        approvedBy = approvedBy
    )

    private fun makeRecord(
        id: Int,
        report: ExpenseReport,
        user: User = report.user!!,
        origin: String = "Târgu Jiu",
        destination: String = "Karlovac",
        distanceKm: Double = 780.0,
        startTime: Instant = Instant.parse("2026-04-10T05:30:00Z"), // 08:30 Europe/Bucharest (UTC+3 in April)
        endTime: Instant = Instant.parse("2026-04-10T14:45:00Z"),   // 17:45 Europe/Bucharest
        description: String? = "Deplasare client",
        vehiclePlate: String? = "GJ01POA",
        vehicleMakeModel: String? = "Audi A6",
        vehicleFuelType: String? = "diesel",
        vehicleCategory: String? = "M1",
        fuelConsumption: BigDecimal? = BigDecimal("8.0"),
        roundTrip: Boolean = false
    ): MileageRecord = MileageRecord(
        id = id,
        report = report,
        user = user,
        origin = origin,
        destination = destination,
        distanceKm = distanceKm,
        rateBeforeTax = BigDecimal("0.60"),
        rateAfterTax = BigDecimal("0.40"),
        amountBeforeTax = BigDecimal("468.00"),
        amountEur = BigDecimal("312.00"),
        amountOriginal = BigDecimal("312.00"),
        currencyOriginal = "EUR",
        fxRate = BigDecimal.ONE,
        fuelConsumptionLitersPer100Km = fuelConsumption,
        startTime = startTime,
        endTime = endTime,
        description = description,
        vehiclePlate = vehiclePlate,
        vehicleMakeModel = vehicleMakeModel,
        vehicleFuelType = vehicleFuelType,
        vehicleCategory = vehicleCategory,
        roundTrip = roundTrip
    )

    private fun parseWorkbook(bytes: ByteArray): XSSFWorkbook =
        XSSFWorkbook(ByteArrayInputStream(bytes))

    @Test
    fun `single month single vehicle generates exact 12-column layout with company header, formulas, and signature footer`() {
        val report = makeReport()
        val r1 = makeRecord(
            id = 1,
            report = report,
            origin = "Târgu Jiu",
            destination = "Karlovac",
            distanceKm = 780.0,
            startTime = Instant.parse("2026-04-10T05:30:00Z"), // 08:30 EEST
            endTime = Instant.parse("2026-04-10T14:45:00Z"),   // 17:45 EEST
            description = "Intervenție linie",
            roundTrip = false
        )
        val r2 = makeRecord(
            id = 2,
            report = report,
            origin = "Hotel",
            destination = "Fabrica Heineken",
            distanceKm = 24.5,
            startTime = Instant.parse("2026-04-11T04:15:00Z"), // 07:15 EEST
            endTime = Instant.parse("2026-04-11T15:00:00Z"),   // 18:00 EEST
            description = "Navetă zilnică",
            roundTrip = true
        )

        val bytes = service.buildTripSheet(report, listOf(r2, r1)) // deliberately unsorted input
        parseWorkbook(bytes).use { wb ->
            assertEquals(1, wb.numberOfSheets)
            val sheet = wb.getSheetAt(0)
            assertEquals("Aprilie", sheet.sheetName)

            // Header rows 1-4
            assertEquals("Newtech Automation", sheet.getRow(0).getCell(0).stringCellValue)
            assertEquals("Raport: Heineken Hrvatska · KA-2026-100", sheet.getRow(1).getCell(0).stringCellValue)
            assertEquals("Foaie de parcurs pentru autovehicule", sheet.getRow(3).getCell(0).stringCellValue)

            // Metadata block rows 5-8
            assertEquals("Luna", sheet.getRow(4).getCell(0).stringCellValue)
            assertEquals("APRILIE", sheet.getRow(4).getCell(2).stringCellValue)
            assertEquals("Auto", sheet.getRow(4).getCell(5).stringCellValue)
            assertEquals("Audi A6 - GJ01POA", sheet.getRow(4).getCell(6).stringCellValue)
            assertEquals("Kilometraj la plecare", sheet.getRow(4).getCell(8).stringCellValue)
            assertEquals(375000.0, sheet.getRow(4).getCell(11).numericCellValue, 0.001)

            assertEquals("Șofer", sheet.getRow(5).getCell(0).stringCellValue)
            assertEquals("Ion Popescu", sheet.getRow(5).getCell(2).stringCellValue)
            assertEquals("Categorie auto", sheet.getRow(5).getCell(5).stringCellValue)
            assertEquals("M1", sheet.getRow(5).getCell(6).stringCellValue)
            assertEquals("Kilometraj la sosire", sheet.getRow(5).getCell(8).stringCellValue)
            assertEquals(CellType.FORMULA, sheet.getRow(5).getCell(11).cellType)
            assertEquals("L5+L7", sheet.getRow(5).getCell(11).cellFormula)

            assertEquals("Tip combustibil", sheet.getRow(6).getCell(5).stringCellValue)
            assertEquals("Diesel", sheet.getRow(6).getCell(6).stringCellValue)
            assertEquals("Total kilometri", sheet.getRow(6).getCell(8).stringCellValue)
            assertEquals(CellType.FORMULA, sheet.getRow(6).getCell(11).cellType)
            assertEquals("SUM(L12:L13)", sheet.getRow(6).getCell(11).cellFormula)

            assertEquals("Norma proprie de consum", sheet.getRow(7).getCell(5).stringCellValue)
            assertEquals("0,08 (L/km)", sheet.getRow(7).getCell(6).stringCellValue)

            // Key merged regions
            val merged = sheet.mergedRegions.map { it.formatAsString() }.toSet()
            assertTrue("A1:L1" in merged, "Expected A1:L1 in $merged")
            assertTrue("A2:L2" in merged, "Expected A2:L2 in $merged")
            assertTrue("A4:L4" in merged, "Expected A4:L4 in $merged")
            assertTrue("A10:A11" in merged, "Expected A10:A11 in $merged")
            assertTrue("B10:C10" in merged, "Expected B10:C10 in $merged")
            assertTrue("D10:E10" in merged, "Expected D10:E10 in $merged")
            assertTrue("F10:I10" in merged, "Expected F10:I10 in $merged")
            assertTrue("J10:L10" in merged, "Expected J10:L10 in $merged")

            // Table headers rows 10-11
            assertEquals("Nr. Crt.", sheet.getRow(9).getCell(0).stringCellValue)
            assertEquals("La plecare", sheet.getRow(9).getCell(1).stringCellValue)
            assertEquals("Ora", sheet.getRow(10).getCell(1).stringCellValue)
            assertEquals("Data", sheet.getRow(10).getCell(2).stringCellValue)
            assertEquals("La sosire", sheet.getRow(9).getCell(3).stringCellValue)
            assertEquals("Ora", sheet.getRow(10).getCell(3).stringCellValue)
            assertEquals("Data", sheet.getRow(10).getCell(4).stringCellValue)
            assertEquals("Ruta", sheet.getRow(9).getCell(5).stringCellValue)
            assertEquals("Plecat de la", sheet.getRow(10).getCell(5).stringCellValue)
            assertEquals("Sosit la", sheet.getRow(10).getCell(6).stringCellValue)
            assertEquals("Scop", sheet.getRow(10).getCell(7).stringCellValue)
            assertEquals("Dus / Întors", sheet.getRow(10).getCell(8).stringCellValue)
            assertEquals("Kilometraj", sheet.getRow(9).getCell(9).stringCellValue)
            assertEquals("La plecare", sheet.getRow(10).getCell(9).stringCellValue)
            assertEquals("La sosire", sheet.getRow(10).getCell(10).stringCellValue)
            assertEquals("Nr. Km. parcurși", sheet.getRow(10).getCell(11).stringCellValue)

            // Row 12 (idx 11): first trip chronologically (r1)
            val row12 = sheet.getRow(11)
            assertEquals(1.0, row12.getCell(0).numericCellValue, 0.001)
            assertEquals("08:30", row12.getCell(1).stringCellValue)
            assertEquals("10.04.2026", row12.getCell(2).stringCellValue)
            assertEquals("17:45", row12.getCell(3).stringCellValue)
            assertEquals("10.04.2026", row12.getCell(4).stringCellValue)
            assertEquals("Târgu Jiu", row12.getCell(5).stringCellValue)
            assertEquals("Karlovac", row12.getCell(6).stringCellValue)
            assertEquals("Intervenție linie", row12.getCell(7).stringCellValue)
            assertEquals("", row12.getCell(8).stringCellValue)
            assertEquals(CellType.FORMULA, row12.getCell(9).cellType)
            assertEquals("L5", row12.getCell(9).cellFormula)
            assertEquals(CellType.FORMULA, row12.getCell(10).cellType)
            assertEquals("J12+L12", row12.getCell(10).cellFormula)
            assertEquals(780.0, row12.getCell(11).numericCellValue, 0.001)

            // Row 13 (idx 12): second trip (r2, roundTrip = true)
            val row13 = sheet.getRow(12)
            assertEquals(2.0, row13.getCell(0).numericCellValue, 0.001)
            assertEquals("07:15", row13.getCell(1).stringCellValue)
            assertEquals("11.04.2026", row13.getCell(2).stringCellValue)
            assertEquals("18:00", row13.getCell(3).stringCellValue)
            assertEquals("11.04.2026", row13.getCell(4).stringCellValue)
            assertEquals("Hotel", row13.getCell(5).stringCellValue)
            assertEquals("Fabrica Heineken", row13.getCell(6).stringCellValue)
            assertEquals("Navetă zilnică", row13.getCell(7).stringCellValue)
            assertEquals("x", row13.getCell(8).stringCellValue)
            assertEquals(CellType.FORMULA, row13.getCell(9).cellType)
            assertEquals("K12", row13.getCell(9).cellFormula)
            assertEquals(CellType.FORMULA, row13.getCell(10).cellType)
            assertEquals("J13+L13", row13.getCell(10).cellFormula)
            assertEquals(24.5, row13.getCell(11).numericCellValue, 0.001)

            // Total row 14 (idx 13)
            val totalRow = sheet.getRow(13)
            assertEquals("TOTAL", totalRow.getCell(1).stringCellValue)
            assertEquals(CellType.FORMULA, totalRow.getCell(10).cellType)
            assertEquals("L6", totalRow.getCell(10).cellFormula)
            assertEquals(CellType.FORMULA, totalRow.getCell(11).cellType)
            assertEquals("SUM(L12:L13)", totalRow.getCell(11).cellFormula)

            // Signature rows 16-17 (idx 15-16)
            val sigRow1 = sheet.getRow(15)
            assertEquals("Șofer: Ion Popescu", sigRow1.getCell(1).stringCellValue)
            assertEquals("Aprobat: Maria Ionescu", sigRow1.getCell(7).stringCellValue)
            val sigRow2 = sheet.getRow(16)
            assertEquals("Semnătură: ________________________", sigRow2.getCell(1).stringCellValue)
            assertEquals("Semnătură: ________________________", sigRow2.getCell(7).stringCellValue)
            assertTrue(CellRangeAddress(15, 15, 1, 4).formatAsString() in merged)
            assertTrue(CellRangeAddress(15, 15, 7, 11).formatAsString() in merged)

            // Print setup: A4 landscape fit to 1 page wide
            assertTrue(sheet.printSetup.landscape)
            assertEquals(PrintSetup.A4_PAPERSIZE, sheet.printSetup.paperSize)
            assertTrue(sheet.fitToPage)
            assertEquals(1.toShort(), sheet.printSetup.fitWidth)
            assertEquals(0.toShort(), sheet.printSetup.fitHeight)
        }
    }

    @Test
    fun `multi-month and multi-year trips create separate tabs and carry odometer across months`() {
        val report = makeReport(startingOdometerKm = BigDecimal("375000.0"))
        val decTrip = makeRecord(
            id = 1,
            report = report,
            distanceKm = 1000.0,
            startTime = Instant.parse("2026-12-28T07:00:00Z"),
            endTime = Instant.parse("2026-12-28T18:00:00Z")
        )
        val janTrip = makeRecord(
            id = 2,
            report = report,
            distanceKm = 50.0,
            startTime = Instant.parse("2027-01-03T08:00:00Z"),
            endTime = Instant.parse("2027-01-03T09:00:00Z")
        )

        val bytes = service.buildTripSheet(report, listOf(decTrip, janTrip))
        parseWorkbook(bytes).use { wb ->
            assertEquals(2, wb.numberOfSheets)

            val decSheet = wb.getSheetAt(0)
            assertEquals("Decembrie 2026", decSheet.sheetName)
            assertEquals("DECEMBRIE", decSheet.getRow(4).getCell(2).stringCellValue)
            assertEquals(375000.0, decSheet.getRow(4).getCell(11).numericCellValue, 0.001)
            assertEquals("SUM(L12:L12)", decSheet.getRow(6).getCell(11).cellFormula)

            val janSheet = wb.getSheetAt(1)
            assertEquals("Ianuarie 2027", janSheet.sheetName)
            assertEquals("IANUARIE", janSheet.getRow(4).getCell(2).stringCellValue)
            assertEquals(376000.0, janSheet.getRow(4).getCell(11).numericCellValue, 0.001)
            assertEquals("SUM(L12:L12)", janSheet.getRow(6).getCell(11).cellFormula)
        }
    }

    @Test
    fun `multi-vehicle report names sheets per month and vehicle, applying starting odometer only to primary vehicle`() {
        val report = makeReport(startingOdometerKm = BigDecimal("375000.0"))
        val primaryTrip = makeRecord(
            id = 1,
            report = report,
            vehiclePlate = "GJ01POA",
            vehicleMakeModel = "Audi A6",
            distanceKm = 120.0,
            startTime = Instant.parse("2026-04-10T06:00:00Z"),
            endTime = Instant.parse("2026-04-10T08:00:00Z")
        )
        val secondaryTrip = makeRecord(
            id = 2,
            report = report,
            vehiclePlate = "B99XYZ",
            vehicleMakeModel = "Dacia Duster",
            vehicleFuelType = "petrol",
            distanceKm = 85.0,
            startTime = Instant.parse("2026-04-11T06:00:00Z"),
            endTime = Instant.parse("2026-04-11T07:30:00Z")
        )

        val bytes = service.buildTripSheet(report, listOf(primaryTrip, secondaryTrip))
        parseWorkbook(bytes).use { wb ->
            assertEquals(2, wb.numberOfSheets)

            val sheet1 = wb.getSheetAt(0)
            assertEquals("Aprilie - GJ01POA", sheet1.sheetName)
            assertEquals(375000.0, sheet1.getRow(4).getCell(11).numericCellValue, 0.001)
            assertEquals(CellType.FORMULA, sheet1.getRow(5).getCell(11).cellType)
            assertEquals("L5+L7", sheet1.getRow(5).getCell(11).cellFormula)

            val sheet2 = wb.getSheetAt(1)
            assertEquals("Aprilie - B99XYZ", sheet2.sheetName)
            assertEquals("Benzină", sheet2.getRow(6).getCell(6).stringCellValue)
            assertEquals(CellType.BLANK, sheet2.getRow(4).getCell(11).cellType)
            assertEquals(CellType.BLANK, sheet2.getRow(5).getCell(11).cellType)
            assertEquals(CellType.FORMULA, sheet2.getRow(6).getCell(11).cellType)
            assertEquals("SUM(L12:L12)", sheet2.getRow(6).getCell(11).cellFormula)
        }
    }

    @Test
    fun `null starting odometer leaves odometer cells blank while summing total distance`() {
        val report = makeReport(startingOdometerKm = null)
        val trip = makeRecord(id = 1, report = report, distanceKm = 150.0)

        val bytes = service.buildTripSheet(report, listOf(trip))
        parseWorkbook(bytes).use { wb ->
            val sheet = wb.getSheetAt(0)
            // L5 and L6 blank
            assertEquals(CellType.BLANK, sheet.getRow(4).getCell(11).cellType)
            assertEquals(CellType.BLANK, sheet.getRow(5).getCell(11).cellType)
            // L7 still sums distance
            assertEquals(CellType.FORMULA, sheet.getRow(6).getCell(11).cellType)
            assertEquals("SUM(L12:L12)", sheet.getRow(6).getCell(11).cellFormula)

            // Row 12: J12 and K12 blank, L12 numeric
            assertEquals(CellType.BLANK, sheet.getRow(11).getCell(9).cellType)
            assertEquals(CellType.BLANK, sheet.getRow(11).getCell(10).cellType)
            assertEquals(150.0, sheet.getRow(11).getCell(11).numericCellValue, 0.001)

            // Total row 13 (idx 12): K13 blank, L13 SUM formula
            assertEquals(CellType.BLANK, sheet.getRow(12).getCell(10).cellType)
            assertEquals(CellType.FORMULA, sheet.getRow(12).getCell(11).cellType)
            assertEquals("SUM(L12:L12)", sheet.getRow(12).getCell(11).cellFormula)
        }
    }

    @Test
    fun `sanitizes Excel formula injection in user-supplied strings`() {
        val report = makeReport(startingOdometerKm = BigDecimal("100000.0"))
        val trip = makeRecord(
            id = 1,
            report = report,
            origin = "=CMD|'/C calc'!A0",
            destination = "@SUM(1+1)",
            description = "+SUM(A1:A2)",
            distanceKm = 42.0
        )

        val bytes = service.buildTripSheet(report, listOf(trip))
        parseWorkbook(bytes).use { wb ->
            val sheet = wb.getSheetAt(0)
            val row12 = sheet.getRow(11)

            // User-supplied cells are sanitized strings prefixed with single quote
            assertEquals(CellType.STRING, row12.getCell(5).cellType)
            assertEquals("'=CMD|'/C calc'!A0", row12.getCell(5).stringCellValue)
            assertEquals(CellType.STRING, row12.getCell(6).cellType)
            assertEquals("'@SUM(1+1)", row12.getCell(6).stringCellValue)
            assertEquals(CellType.STRING, row12.getCell(7).cellType)
            assertEquals("'+SUM(A1:A2)", row12.getCell(7).stringCellValue)

            // Real workbook formulas remain genuine FORMULA cells
            assertEquals(CellType.FORMULA, sheet.getRow(5).getCell(11).cellType)
            assertEquals("L5+L7", sheet.getRow(5).getCell(11).cellFormula)
            assertEquals(CellType.FORMULA, sheet.getRow(6).getCell(11).cellType)
            assertEquals("SUM(L12:L12)", sheet.getRow(6).getCell(11).cellFormula)
            assertEquals(CellType.FORMULA, row12.getCell(10).cellType)
            assertEquals("J12+L12", row12.getCell(10).cellFormula)
        }
    }
}
