package eu.nt.xpenses.config

import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.ArgumentCaptor
import org.mockito.BDDMockito.given
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder

class CiTestFixtureInitializerTest {
    private val userRepository = mock(UserRepository::class.java)
    private val passwordEncoder = mock(BCryptPasswordEncoder::class.java)

    @Test
    fun `creates only the configured technician`() {
        given(userRepository.findByUsername("ci-tech")).willReturn(null)
        given(passwordEncoder.encode("random-password"))
            .willReturn("encoded-password")

        val initializer = CiTestFixtureInitializer(
            userRepository = userRepository,
            passwordEncoder = passwordEncoder,
            username = "ci-tech",
            password = "random-password"
        )

        initializer.run()

        val captor = ArgumentCaptor.forClass(User::class.java)
        verify(userRepository).save(captor.capture())
        val created = captor.value
        assertEquals("ci-tech", created.username)
        assertEquals("CI Technician", created.displayName)
        assertEquals("ci-tech@ci.invalid", created.email)
        assertEquals("technician", created.role)
        assertEquals("local", created.authSource)
        assertEquals("encoded-password", created.passwordHash)
        assertEquals(true, created.isActive)
    }

    @Test
    fun `does not replace an existing configured technician`() {
        val existing = User(
            username = "ci-tech",
            displayName = "Existing Technician",
            role = "technician"
        )
        given(userRepository.findByUsername("ci-tech")).willReturn(existing)

        val initializer = CiTestFixtureInitializer(
            userRepository = userRepository,
            passwordEncoder = passwordEncoder,
            username = "ci-tech",
            password = "random-password"
        )

        initializer.run()

        verify(userRepository).findByUsername("ci-tech")
        org.mockito.Mockito.verifyNoMoreInteractions(userRepository)
    }

    @Test
    fun `rejects missing credentials`() {
        val initializer = CiTestFixtureInitializer(
            userRepository = userRepository,
            passwordEncoder = passwordEncoder,
            username = "",
            password = "short"
        )

        assertThrows<IllegalStateException> { initializer.run() }
    }
}
