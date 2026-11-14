package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.search.SearchResult
import eu.nt.xpenses.model.User
import eu.nt.xpenses.repositories.ExpenseReportRepository
import eu.nt.xpenses.repositories.ExpenseRepository
import eu.nt.xpenses.services.Authorization
import eu.nt.xpenses.services.mapper.ExpenseMapper
import eu.nt.xpenses.services.mapper.ReportMapper
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/search")
class SearchController(
    private val expenseRepository: ExpenseRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val expenseMapper: ExpenseMapper,
    private val reportMapper: ReportMapper,
    private val authorization: Authorization,
) {
    @GetMapping
    @Transactional(readOnly = true)
    fun search(
        @RequestParam(value = "q", required = false) query: String?,
        @RequestParam(value = "all", required = false, defaultValue = "false") all: Boolean,
        request: HttpServletRequest
    ): SearchResult {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        if (query.isNullOrBlank()) {
            return SearchResult(
                reports = emptyList(),
                expenses = emptyList(),
                reportCount = 0,
                expenseCount = 0
            )
        }

        val term = query.trim()
        val userId = authorization.effectiveUserId(currentUser, all)

        val reports = expenseReportRepository.search(userId, term).map { reportMapper.mapReportToOut(it) }
        val expenses = expenseRepository.search(userId, term).map { expenseMapper.toExpenseOut(it) }

        return SearchResult(
            reports = reports,
            expenses = expenses,
            reportCount = reports.size,
            expenseCount = expenses.size
        )
    }
}
