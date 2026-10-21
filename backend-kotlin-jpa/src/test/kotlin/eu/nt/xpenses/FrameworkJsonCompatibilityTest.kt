package eu.nt.xpenses

import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.services.SaveIdempotencyService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import java.math.BigDecimal

/** Golden fingerprint captured from an actual Boot 3 / Jackson 2 HTTP save. */
class FrameworkJsonCompatibilityTest : IntegrationTestBase() {
    @Autowired lateinit var saves: SaveIdempotencyService

    @Test
    fun `Boot 3 durable save keys keep their fingerprint after framework migration`() {
        val request =
            ExpenseCreate(
                amount = BigDecimal("12.34"),
                currency = "EUR",
                date = "2026-10-21",
                merchant = "Framework upgrade replay fixture",
            )

        assertEquals(
            "dbc043ee18758c0fe9eb687e033181ddd4b1176e7cb6c7b381d54567cc97d5d7",
            saves.hash(request),
            "A serializer upgrade must not make an unchanged historical keyed save conflict or create a replacement",
        )
    }
}
