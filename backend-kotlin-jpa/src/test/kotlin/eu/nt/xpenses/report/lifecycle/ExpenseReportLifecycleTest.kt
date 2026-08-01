package eu.nt.xpenses.report.lifecycle

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.Expense
import eu.nt.xpenses.model.ExpenseReport
import eu.nt.xpenses.model.User
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.HttpStatus
import org.springframework.web.server.ResponseStatusException
import java.math.BigDecimal

class ExpenseReportLifecycleTest : IntegrationTestBase() {

    @Autowired
    private lateinit var lifecycle: ExpenseReportLifecycle

    @Autowired
    private lateinit var entityManager: EntityManager

    private fun user(username: String): User = userRepository.findByUsername(username)!!

    private fun makeReport(username: String, status: String = "draft"): ExpenseReport {
        return expenseReportRepository.save(
            ExpenseReport(
                user = user(username),
                title = "Lifecycle Report",
                status = status
            )
        )
    }

    private fun makeExpense(username: String, report: ExpenseReport? = null, status: String = "draft"): Expense {
        val category = categoryRepository.findAll().firstOrNull()
            ?: error("No seeded category found")
        return expenseRepository.save(
            Expense(
                user = user(username),
                category = category,
                report = report,
                amountOriginal = BigDecimal("50.00"),
                amountEur = BigDecimal("50.00"),
                date = "2026-06-01",
                status = status
            )
        )
    }

    private fun flushAndClear() {
        entityManager.flush()
        entityManager.clear()
    }

    @Test
    fun `submit attaches draft expenses mirrors statuses recalculates total and emits event`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1")

        val outcome = lifecycle.submit(
            report.id!!,
            SubmitReportCommand(listOf(expense.id!!)),
            user("tech1")
        )

        assertEquals("submitted", outcome.report.status)
        assertEquals(BigDecimal("50.00"), outcome.report.totalAmount)
        assertNotNull(outcome.report.submittedAt)
        assertEquals("submitted", expenseRepository.findById(expense.id!!).get().status)

        val event = outcome.events.single() as ExpenseReportLifecycleEvent.ReportSubmitted
        assertEquals("Lifecycle Report", event.reportTitle)
        assertEquals("Ion Popescu", event.ownerDisplayName)
        assertEquals(BigDecimal("50.00"), event.totalAmount)
        assertEquals("EUR", event.currency)
    }

    @Test
    fun `recall submitted report returns report and expenses to draft`() {
        val report = makeReport("tech1", "submitted").also {
            it.submittedAt = java.time.Instant.now()
            expenseReportRepository.save(it)
        }
        val expense = makeExpense("tech1", report, "submitted")
        flushAndClear()

        val outcome = lifecycle.recall(report.id!!, user("tech1"))
        flushAndClear()

        assertEquals("draft", outcome.report.status)
        assertNull(outcome.report.submittedAt)
        assertEquals("draft", expenseRepository.findById(expense.id!!).get().status)
        assertTrue(outcome.events.isEmpty())
    }

    @Test
    fun `manager approves another users submitted report and emits event`() {
        val report = makeReport("tech1", "submitted")
        val expense = makeExpense("tech1", report, "submitted")
        flushAndClear()

        val outcome = lifecycle.approve(report.id!!, user("manager1"))
        flushAndClear()

        assertEquals("approved", outcome.report.status)
        assertEquals("approved", expenseRepository.findById(expense.id!!).get().status)
        assertEquals(user("manager1").id, outcome.report.approvedBy?.id)
        assertNotNull(outcome.report.approvedAt)

        val event = outcome.events.single() as ExpenseReportLifecycleEvent.ReportApproved
        assertEquals("Lifecycle Report", event.reportTitle)
        assertEquals("Maria Ionescu", event.approverDisplayName)
    }

    @Test
    fun `manager rejects submitted report and returns expenses to draft with event`() {
        val report = makeReport("tech1", "submitted")
        val expense = makeExpense("tech1", report, "submitted")
        flushAndClear()

        val outcome = lifecycle.reject(
            report.id!!,
            RejectReportCommand("missing receipts"),
            user("manager1")
        )
        flushAndClear()

        assertEquals("rejected", outcome.report.status)
        assertEquals("draft", expenseRepository.findById(expense.id!!).get().status)
        assertEquals("missing receipts", outcome.report.rejectedReason)

        val event = outcome.events.single() as ExpenseReportLifecycleEvent.ReportRejected
        assertEquals("Maria Ionescu", event.rejecterDisplayName)
        assertEquals("missing receipts", event.reason)
    }

    @Test
    fun `finance pays approved report and mirrors paid status with event`() {
        val report = makeReport("tech1", "approved")
        val expense = makeExpense("tech1", report, "approved")
        flushAndClear()

        val outcome = lifecycle.pay(report.id!!, user("cfo1"))
        flushAndClear()

        assertEquals("paid", outcome.report.status)
        assertEquals("paid", expenseRepository.findById(expense.id!!).get().status)
        assertNotNull(outcome.report.paidAt)
        assertTrue(outcome.events.single() is ExpenseReportLifecycleEvent.ReportPaid)
    }

    @Test
    fun `owner signs submitted report without changing status`() {
        val owner = user("tech1").also {
            it.signaturePath = "/tmp/signature.png"
            userRepository.save(it)
        }
        val report = makeReport("tech1", "submitted")

        val outcome = lifecycle.sign(report.id!!, owner)

        assertEquals("submitted", outcome.report.status)
        assertEquals(owner.id, outcome.report.signer?.id)
        assertNotNull(outcome.report.signedAt)
        assertTrue(outcome.events.isEmpty())
    }

    @Test
    fun `owner can delete draft report without deleting attached expenses`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1", report)
        flushAndClear()

        lifecycle.deleteDraft(report.id!!, DeleteDraftReportCommand(deleteExpenses = false), user("tech1"))
        flushAndClear()

        val refreshedExpense = expenseRepository.findById(expense.id!!).get()
        assertEquals("draft", refreshedExpense.status)
        assertNull(refreshedExpense.report)
        assertTrue(expenseReportRepository.findById(report.id!!).isEmpty)
    }

    @Test
    fun `owner can delete draft report with attached draft expenses`() {
        val report = makeReport("tech1")
        val expense = makeExpense("tech1", report)
        flushAndClear()

        lifecycle.deleteDraft(report.id!!, DeleteDraftReportCommand(deleteExpenses = true), user("tech1"))
        flushAndClear()

        assertTrue(expenseRepository.findById(expense.id!!).isEmpty)
        assertTrue(expenseReportRepository.findById(report.id!!).isEmpty)
    }

    @Test
    fun `non owner cannot submit report`() {
        val report = makeReport("tech1")

        val ex = assertThrows<ResponseStatusException> {
            lifecycle.submit(report.id!!, SubmitReportCommand(emptyList()), user("manager1"))
        }

        assertEquals(HttpStatus.FORBIDDEN, ex.statusCode)
    }

    @Test
    fun `manager cannot approve own submitted report`() {
        val report = makeReport("manager1", "submitted")

        val ex = assertThrows<ResponseStatusException> {
            lifecycle.approve(report.id!!, user("manager1"))
        }

        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }

    @Test
    fun `technician cannot reject submitted report`() {
        val report = makeReport("manager1", "submitted")

        val ex = assertThrows<ResponseStatusException> {
            lifecycle.reject(report.id!!, RejectReportCommand("no"), user("tech1"))
        }

        assertEquals(HttpStatus.FORBIDDEN, ex.statusCode)
    }

    @Test
    fun `manager cannot pay approved report`() {
        val report = makeReport("tech1", "approved")

        val ex = assertThrows<ResponseStatusException> {
            lifecycle.pay(report.id!!, user("manager1"))
        }

        assertEquals(HttpStatus.FORBIDDEN, ex.statusCode)
    }

    @Test
    fun `invalid transition returns bad request`() {
        val report = makeReport("tech1", "draft")

        val ex = assertThrows<ResponseStatusException> {
            lifecycle.approve(report.id!!, user("manager1"))
        }

        assertEquals(HttpStatus.BAD_REQUEST, ex.statusCode)
    }
}
