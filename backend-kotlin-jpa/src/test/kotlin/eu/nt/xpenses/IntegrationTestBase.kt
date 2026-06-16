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
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer

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
        }
    }

    @Autowired lateinit var mockMvc: MockMvc
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
        authHelper = TestAuthHelper(mockMvc)
        given(fxService.getRate(anyString(), anyString())).willReturn(1.0)
    }
}
