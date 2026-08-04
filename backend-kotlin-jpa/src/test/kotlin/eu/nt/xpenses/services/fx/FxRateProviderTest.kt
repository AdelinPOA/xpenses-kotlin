package eu.nt.xpenses.services.fx

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import java.math.BigDecimal
import java.time.LocalDate

class FxRateProviderTest {
    @Test
    fun `BNR parser selects latest banking day not after requested date`() {
        val xml = """
            <DataSet>
              <Body>
                <Cube date="2026-01-02">
                  <Rate currency="EUR">5.0000</Rate>
                  <Rate currency="USD">4.0000</Rate>
                </Cube>
                <Cube date="2026-01-05">
                  <Rate currency="EUR">5.1000</Rate>
                  <Rate currency="USD">4.0800</Rate>
                </Cube>
              </Body>
            </DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "USD", LocalDate.parse("2026-01-04"))

        assertNotNull(result)
        assertEquals(LocalDate.parse("2026-01-02"), result!!.sourceDate)
        assertEquals(FxRateSource.BNR, result.source)
        assertEquals(BigDecimal("0.800000000000"), result.rateToEur)
    }

    @Test
    fun `BNR parser handles RON as inverse of EUR reference rate`() {
        val xml = """
            <DataSet><Body><Cube date="2026-01-02">
              <Rate currency="EUR">5.0000</Rate>
            </Cube></Body></DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "RON", LocalDate.parse("2026-01-02"))

        assertEquals(BigDecimal("0.200000000000"), result!!.rateToEur)
    }

    @Test
    fun `BNR parser handles a year boundary by retaining the prior banking day`() {
        val xml = """
            <DataSet><Body>
              <Cube date="2025-12-31"><Rate currency="EUR">5.0000</Rate><Rate currency="USD">4.0000</Rate></Cube>
              <Cube date="2026-01-02"><Rate currency="EUR">5.1000</Rate><Rate currency="USD">4.0800</Rate></Cube>
            </Body></DataSet>
        """.trimIndent()

        val result = BnrRateProvider.parse(xml, "USD", LocalDate.parse("2026-01-01"))

        assertNotNull(result)
        assertEquals(LocalDate.parse("2025-12-31"), result!!.sourceDate)
        assertEquals(BigDecimal("0.800000000000"), result.rateToEur)
    }
}
