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
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.web.servlet.MockMvc
import org.springframework.transaction.annotation.Transactional
import org.testcontainers.containers.PostgreSQLContainer

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
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
