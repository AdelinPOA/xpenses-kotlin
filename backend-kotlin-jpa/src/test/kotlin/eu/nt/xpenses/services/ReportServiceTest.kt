package eu.nt.xpenses.services

import eu.nt.xpenses.models.ExpenseReport
import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.repositories.UserRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.*
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.util.Optional

class ReportServiceTest {

    private val reportRepository = mock(ExpenseReportRepository::class.java)
    private val expenseRepository = mock(ExpenseRepository::class.java)
    private val userRepository = mock(UserRepository::class.java)
    private val emailSettingsService = mock(EmailSettingsService::class.java)

    private val reportService = ReportService(
        reportRepository,
        expenseRepository,
        userRepository,
        emailSettingsService
    )

    private lateinit var techUser: User
    private lateinit var managerUser: User

    @BeforeEach
    fun setup() {
        techUser = User(id = 1, username = "tech", displayName = "Tech", role = "technician")
        managerUser = User(id = 2, username = "manager", displayName = "Manager", role = "manager")
    }

    @Test
    fun `submitReport should throw 403 if not owner`() {
        val report = ExpenseReport(id = 1, user = techUser, title = "T", status = "draft")
        `when`(reportRepository.findById(1)).thenReturn(Optional.of(report))

        val ex = assertThrows<ResponseStatusException> {
            reportService.submitReport(1, emptyList(), managerUser)
        }
        assertEquals(HttpStatus.FORBIDDEN, ex.statusCode)
    }

    @Test
    fun `submitReport should throw 400 if not draft`() {
        val report = ExpenseReport(id = 1, user = techUser, title = "T", status = "submitted")
        `when`(reportRepository.findById(1)).thenReturn(Optional.of(report))

        val ex = assertThrows<ResponseStatusException> {
            reportService.submitReport(1, emptyList(), techUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `approveReport should throw 403 if not manager`() {
        val report = ExpenseReport(id = 1, user = techUser, title = "T", status = "submitted")
        `when`(reportRepository.findById(1)).thenReturn(Optional.of(report))

        val ex = assertThrows<ResponseStatusException> {
            reportService.approveReport(1, techUser)
        }
        assertEquals(HttpStatus.FORBIDDEN, ex.statusCode)
    }

    @Test
    fun `approveReport should throw 400 if approving own report`() {
        val report = ExpenseReport(id = 1, user = managerUser, title = "T", status = "submitted")
        `when`(reportRepository.findById(1)).thenReturn(Optional.of(report))

        val ex = assertThrows<ResponseStatusException> {
            reportService.approveReport(1, managerUser)
        }
        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }
}
