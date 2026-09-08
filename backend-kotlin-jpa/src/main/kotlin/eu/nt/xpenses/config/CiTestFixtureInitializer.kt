package eu.nt.xpenses.config

import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.UserRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.CommandLineRunner
import org.springframework.context.annotation.Profile
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional

/**
 * Creates the single disposable identity used by authenticated CI browser tests.
 *
 * This bean is only available under the ci profile. Production never loads it, and
 * the credentials are supplied by the CI runner rather than stored in the repository.
 */
@Component
@Profile("ci")
class CiTestFixtureInitializer(
    private val userRepository: UserRepository,
    private val passwordEncoder: BCryptPasswordEncoder,
    @Value("\${ci.test.technician.username:}") private val username: String,
    @Value("\${ci.test.technician.password:}") private val password: String,
) : CommandLineRunner {
    @Transactional
    override fun run(vararg args: String) {
        val normalizedUsername = username.trim()
        check(normalizedUsername.isNotEmpty()) {
            "ci.test.technician.username must be configured when the ci profile is active"
        }
        check(password.length >= 12) {
            "ci.test.technician.password must contain at least 12 characters"
        }

        if (userRepository.findByUsername(normalizedUsername) != null) return

        userRepository.save(
            User(
                username = normalizedUsername,
                displayName = "CI Technician",
                email = "$normalizedUsername@ci.invalid",
                passwordHash = passwordEncoder.encode(password),
                authSource = "local",
                role = "technician",
                isActive = true,
            )
        )
    }
}
