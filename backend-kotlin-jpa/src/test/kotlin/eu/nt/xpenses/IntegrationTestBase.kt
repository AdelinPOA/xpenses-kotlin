package eu.nt.xpenses

import eu.nt.xpenses.repositories.*
import eu.nt.xpenses.services.EmailSettingsService
import eu.nt.xpenses.services.FxService
import eu.nt.xpenses.services.OcrService
import org.junit.jupiter.api.BeforeEach
import org.mockito.BDDMockito.given
import org.mockito.ArgumentMatchers.anyString
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.setup.MockMvcBuilders.webAppContextSetup
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.context.WebApplicationContext
import org.testcontainers.containers.PostgreSQLContainer
import java.math.BigDecimal

// @Transactional wraps each test method and rolls back, giving isolation without truncation.
// MockMvc (WebEnvironment.MOCK) dispatches synchronously in the same thread, so controller
// writes participate in the test transaction and are also rolled back.
// NOTE: data saved in a test method is visible to subsequent repository calls in the SAME
// transaction but NOT to a second controller dispatch (which uses its own transaction scope).
// authHelper.loginAs() queries committed seeded data only — never test-created entities.
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Transactional
abstract class IntegrationTestBase {

    companion object {
        @JvmStatic
        val postgres: PostgreSQLContainer<*> = PostgreSQLContainer("postgres:16-alpine")
            .also { it.start() }

        @DynamicPropertySource
        @JvmStatic
        fun overrideProperties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("jwt.secret") { "test-secret-at-least-32-chars-long" }
            registry.add("encryption.secret") { "test-secret-at-least-32-chars-long" }
            registry.add("bucket4j.enabled") { "false" }
            registry.add("seed.demo.users") { "true" }
        }
    }

    @Autowired lateinit var webApplicationContext: WebApplicationContext
    lateinit var mockMvc: MockMvc

    @Autowired lateinit var userRepository: UserRepository
    @Autowired lateinit var categoryRepository: CategoryRepository
    @Autowired lateinit var expenseRepository: ExpenseRepository
    @Autowired lateinit var expenseReportRepository: ExpenseReportRepository
    @Autowired lateinit var advancePaymentRepository: AdvancePaymentRepository

    @MockitoBean lateinit var emailSettingsService: EmailSettingsService
    @MockitoBean lateinit var fxService: FxService
    @MockitoBean lateinit var ocrService: OcrService

    lateinit var authHelper: TestAuthHelper

    @BeforeEach
    fun setUpBase() {
        // Build MockMvc with the full Spring Security filter chain plus a default Origin header.
        // The csrfOriginRefererFilter (SecurityConfig) 403s state-changing requests lacking an
        // Origin/Referer; MockMvc sends none by default, so a default matching cors.allowed-origins
        // is injected here. The actual request's method/path/body take precedence; only the header
        // is inherited. (Login/refresh are in the filter's skipPaths and don't need it.)
        mockMvc = webAppContextSetup(webApplicationContext)
            .apply<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(springSecurity())
            .defaultRequest<org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder>(
                get("/").header("Origin", "http://localhost:3001")
            )
            .build()
        authHelper = TestAuthHelper(mockMvc)
        given(fxService.getRate(anyString(), anyString())).willReturn(BigDecimal.ONE)
    }
}
