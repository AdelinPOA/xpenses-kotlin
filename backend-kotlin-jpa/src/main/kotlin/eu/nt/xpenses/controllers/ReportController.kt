package eu.nt.xpenses.controllers

import eu.nt.xpenses.models.Report
import eu.nt.xpenses.services.ReportService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/api/reports")
class ReportController(private val reportService: ReportService) {

    @GetMapping
    fun getAllReports(): List<Report> {
        // Trigger verification print statements in stdout
        reportService.processAllReportsEagerly()
        
        // Eagerly fetch and return records as JSON
        return reportService.getAllReportsWithExpenses()
    }

    @GetMapping("/{id}")
    fun getReportById(@PathVariable id: Long): Report? {
        return reportService.getReportWithExpenses(id)
    }
}
