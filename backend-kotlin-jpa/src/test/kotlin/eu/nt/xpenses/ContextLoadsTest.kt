package eu.nt.xpenses

import org.junit.jupiter.api.Test

class ContextLoadsTest : IntegrationTestBase() {

    @Test
    fun `spring context loads and seeded users are present`() {
        assert(userRepository.findByUsername("tech1") != null) { "tech1 not seeded" }
        assert(userRepository.findByUsername("manager1") != null) { "manager1 not seeded" }
        assert(userRepository.findByUsername("cfo1") != null) { "cfo1 not seeded" }
    }
}
