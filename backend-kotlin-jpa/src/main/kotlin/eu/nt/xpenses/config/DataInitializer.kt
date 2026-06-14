package eu.nt.xpenses.config

import eu.nt.xpenses.models.Expense
import eu.nt.xpenses.models.Report
import eu.nt.xpenses.repositories.ReportRepository
import org.springframework.boot.CommandLineRunner
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal

@Component
class DataInitializer(private val reportRepository: ReportRepository) : CommandLineRunner {

    @Transactional
    override fun run(vararg args: String) {
        if (reportRepository.count() == 0L) {
            val report1 = Report(title = "Q1 Business Trip to Munich")
            val expense1 = Expense(
                description = "Flight ticket (Lufthansa)",
                amount = BigDecimal("450.00"),
                currency = "EUR",
                report = report1
            )
            val expense2 = Expense(
                description = "Hotel stay (Motel One)",
                amount = BigDecimal("320.00"),
                currency = "EUR",
                report = report1
            )
            report1.expenses.addAll(listOf(expense1, expense2))
            
            val report2 = Report(title = "Catering Client Dinner")
            val expense3 = Expense(
                description = "Restaurant dinner bill",
                amount = BigDecimal("150.00"),
                currency = "EUR",
                report = report2
            )
            report2.expenses.add(expense3)

            reportRepository.saveAll(listOf(report1, report2))
            println("=== Test Data Seeding Complete ===")
        }
    }
}
