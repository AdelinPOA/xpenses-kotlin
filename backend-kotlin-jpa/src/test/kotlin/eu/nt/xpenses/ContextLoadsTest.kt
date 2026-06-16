package eu.nt.xpenses

import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Test

class ContextLoadsTest : IntegrationTestBase() {

    @Test
    fun `spring context loads and seeded users are present`() {
        assertNotNull(userRepository.findByUsername("tech1"), "tech1 not seeded")
        assertNotNull(userRepository.findByUsername("manager1"), "manager1 not seeded")
        assertNotNull(userRepository.findByUsername("cfo1"), "cfo1 not seeded")
    }
}
