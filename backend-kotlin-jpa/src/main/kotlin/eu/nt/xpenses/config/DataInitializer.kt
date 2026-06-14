package eu.nt.xpenses.config

import eu.nt.xpenses.models.*
import eu.nt.xpenses.repositories.*
import org.springframework.boot.CommandLineRunner
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.stereotype.Component
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant

@Component
class DataInitializer(
    private val userRepository: UserRepository,
    private val categoryRepository: CategoryRepository,
    private val expenseReportRepository: ExpenseReportRepository,
    private val expenseRepository: ExpenseRepository,
    private val appSettingRepository: AppSettingRepository,
    private val passwordEncoder: BCryptPasswordEncoder
) : CommandLineRunner {

    @Transactional
    override fun run(vararg args: String) {
        // 1. Seed categories
        if (categoryRepository.count() == 0L) {
            val categories = listOf(
                Category(name = "Meals & Food", limitAmount = 200.0),
                Category(name = "Transport", limitAmount = 500.0),
                Category(name = "Accommodation", limitAmount = 1000.0),
                Category(name = "Equipment"),
                Category(name = "Software & Subscriptions"),
                Category(name = "Office Supplies", limitAmount = 300.0),
                Category(name = "Training & Education"),
                Category(name = "Entertainment", limitAmount = 500.0),
                Category(name = "Laundry"),
                Category(name = "Other")
            )
            categoryRepository.saveAll(categories)
            println("=== Seeded default categories ===")
        }

        // 2. Seed default mileage rates
        if (!appSettingRepository.existsById("mileage_rate_before_tax")) {
            appSettingRepository.save(AppSetting("mileage_rate_before_tax", "0.60"))
        }
        if (!appSettingRepository.existsById("mileage_rate_after_tax")) {
            appSettingRepository.save(AppSetting("mileage_rate_after_tax", "0.40"))
        }

        // 3. Seed users
        if (userRepository.count() == 0L) {
            val users = listOf(
                User(
                    username = "tech1",
                    displayName = "Ion Popescu",
                    email = "ion.popescu@nt-automation.eu",
                    passwordHash = passwordEncoder.encode("tech1"),
                    role = "technician"
                ),
                User(
                    username = "manager1",
                    displayName = "Maria Ionescu",
                    email = "maria.ionescu@nt-automation.eu",
                    passwordHash = passwordEncoder.encode("manager1"),
                    role = "manager"
                ),
                User(
                    username = "cfo1",
                    displayName = "Elena Dumitrescu",
                    email = "elena.dumitrescu@nt-automation.eu",
                    passwordHash = passwordEncoder.encode("cfo1"),
                    role = "chef_finance"
                ),
                User(
                    username = "mod1",
                    displayName = "Admin Xpenses",
                    email = "admin@nt-automation.eu",
                    passwordHash = passwordEncoder.encode("mod1"),
                    role = "mod"
                )
            )
            userRepository.saveAll(users)
            println("=== Seeded default users ===")
        }

        // 4. Seed sample reports and expenses for tech1 if no reports exist
        if (expenseReportRepository.count() == 0L) {
            val tech1 = userRepository.findByUsername("tech1")
            val transportCategory = categoryRepository.findByName("Transport")
            val foodCategory = categoryRepository.findByName("Meals & Food")

            if (tech1 != null) {
                val report1 = ExpenseReport(
                    user = tech1,
                    title = "Q1 Business Trip to Munich",
                    description = "Trip to Munich for client workshops",
                    status = "draft"
                )
                expenseReportRepository.save(report1)

                val expense1 = Expense(
                    user = tech1,
                    category = transportCategory,
                    report = report1,
                    amountOriginal = 450.0,
                    currencyOriginal = "EUR",
                    amountEur = 450.0,
                    fxRate = 1.0,
                    date = "2026-06-10",
                    description = "Flight ticket (Lufthansa)",
                    status = "draft"
                )
                val expense2 = Expense(
                    user = tech1,
                    category = foodCategory,
                    report = report1,
                    amountOriginal = 320.0,
                    currencyOriginal = "EUR",
                    amountEur = 320.0,
                    fxRate = 1.0,
                    date = "2026-06-11",
                    description = "Hotel stay (Motel One)",
                    status = "draft"
                )

                expenseRepository.saveAll(listOf(expense1, expense2))

                // Update total amount on the report
                report1.totalAmount = 770.0
                expenseReportRepository.save(report1)

                val report2 = ExpenseReport(
                    user = tech1,
                    title = "Catering Client Dinner",
                    description = "Dinner with Siemens project team",
                    status = "draft"
                )
                expenseReportRepository.save(report2)

                val expense3 = Expense(
                    user = tech1,
                    category = foodCategory,
                    report = report2,
                    amountOriginal = 150.0,
                    currencyOriginal = "EUR",
                    amountEur = 150.0,
                    fxRate = 1.0,
                    date = "2026-06-12",
                    description = "Restaurant dinner bill",
                    status = "draft"
                )
                expenseRepository.save(expense3)

                report2.totalAmount = 150.0
                expenseReportRepository.save(report2)

                println("=== Seeded sample reports and expenses ===")
            }
        }
    }
}
