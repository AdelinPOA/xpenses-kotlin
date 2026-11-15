package eu.nt.xpenses.config

import eu.nt.xpenses.model.*
import eu.nt.xpenses.repositories.*
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
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
    private val passwordEncoder: BCryptPasswordEncoder,
    @Value("\${seed.demo.users:false}") private val seedDemoUsers: Boolean,
    @Value("\${spring.profiles.active:}") private val activeProfiles: String = ""
) : CommandLineRunner {

    private val log = LoggerFactory.getLogger(DataInitializer::class.java)

    @Transactional
    override fun run(vararg args: String) {
        // 1. Seed categories
        if (categoryRepository.count() == 0L) {
            val categories = listOf(
                Category(name = "Meals & Food", limitAmount = BigDecimal("200.00")),
                Category(name = "Transport", limitAmount = BigDecimal("500.00")),
                Category(name = "Accommodation", limitAmount = BigDecimal("1000.00")),
                Category(name = "Equipment"),
                Category(name = "Software & Subscriptions"),
                Category(name = "Office Supplies", limitAmount = BigDecimal("300.00")),
                Category(name = "Training & Education"),
                Category(name = "Entertainment", limitAmount = BigDecimal("500.00")),
                Category(name = "Laundry"),
                Category(name = "Other")
            )
            categoryRepository.saveAll(categories)
            log.info("Seeded default categories")
        }

        // 2. Seed default mileage rates
        if (!appSettingRepository.existsById("mileage_rate_before_tax")) {
            appSettingRepository.save(AppSetting("mileage_rate_before_tax", "0.60"))
        }
        if (!appSettingRepository.existsById("mileage_rate_after_tax")) {
            appSettingRepository.save(AppSetting("mileage_rate_after_tax", "0.40"))
        }

        // 3. Seed FX margins as decimal fractions used by FxService.
        if (!appSettingRepository.existsById("fx_margins")) {
            appSettingRepository.save(AppSetting("fx_margins", "{\"EUR\":0.02,\"USD\":0.02,\"GBP\":0.02,\"CHF\":0.02,\"*\":0.02}"))
        }

        val isProdProfile = activeProfiles.split(',').any { it.trim().equals("prod", ignoreCase = true) }
        val allowDemoSeeding = seedDemoUsers && !isProdProfile
        if (seedDemoUsers && isProdProfile) {
            log.warn("Refusing to seed demo users/reports because 'prod' profile is active")
        }

        // 4. Seed users (only when SEED_DEMO_USERS=true and not running in prod)
        if (allowDemoSeeding && userRepository.count() == 0L) {
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
            log.info("Seeded default users")
        }

        // 5. Seed sample reports and expenses for tech1 if no reports exist (demo only)
        if (allowDemoSeeding && expenseReportRepository.count() == 0L) {
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
                    amountOriginal = BigDecimal("450.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("450.00"),
                    fxRate = BigDecimal.ONE,
                    date = "2026-06-10",
                    description = "Flight ticket (Lufthansa)",
                    status = "draft"
                )
                val expense2 = Expense(
                    user = tech1,
                    category = foodCategory,
                    report = report1,
                    amountOriginal = BigDecimal("320.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("320.00"),
                    fxRate = BigDecimal.ONE,
                    date = "2026-06-11",
                    description = "Hotel stay (Motel One)",
                    status = "draft"
                )

                expenseRepository.saveAll(listOf(expense1, expense2))

                // Update total amount on the report
                report1.totalAmount = BigDecimal("770.00")
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
                    amountOriginal = BigDecimal("150.00"),
                    currencyOriginal = "EUR",
                    amountEur = BigDecimal("150.00"),
                    fxRate = BigDecimal.ONE,
                    date = "2026-06-12",
                    description = "Restaurant dinner bill",
                    status = "draft"
                )
                expenseRepository.save(expense3)

                report2.totalAmount = BigDecimal("150.00")
                expenseReportRepository.save(report2)

                log.info("Seeded sample reports and expenses")
            }
        }
    }
}
