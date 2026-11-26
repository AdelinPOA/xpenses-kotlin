package eu.nt.xpenses.services

import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.math.BigDecimal
import java.time.Instant

/**
 * Owns core application-wide policy settings: mobile UI flags and daily allowance rate.
 */
@Service
class AppSettingsService(
    private val appSettingRepository: AppSettingRepository,
) {
    companion object {
        val DEFAULT_DAILY_ALLOWANCE_RATE: BigDecimal = BigDecimal("50.00")
        const val MOBILE_QUICK_ADD_FAB_SETTING = "mobile_quick_add_fab_enabled"
    }

    @Transactional(readOnly = true)
    fun isMobileQuickAddFabEnabled(): Boolean =
        appSettingRepository
            .findById(MOBILE_QUICK_ADD_FAB_SETTING)
            .orElse(null)
            ?.value
            ?.toBooleanStrictOrNull() ?: false

    @Transactional
    fun updateMobileQuickAddFab(enabled: Boolean): Boolean {
        appSettingRepository.save(AppSetting(MOBILE_QUICK_ADD_FAB_SETTING, enabled.toString(), Instant.now()))
        return enabled
    }

    fun getDailyAllowanceRate(): BigDecimal =
        appSettingRepository
            .findById("daily_allowance_rate")
            .orElse(null)
            ?.value
            ?.let { BigDecimal(it) }
            ?: DEFAULT_DAILY_ALLOWANCE_RATE

    @Transactional
    fun updateDailyAllowanceRate(rate: BigDecimal): BigDecimal {
        if (rate < BigDecimal.ZERO) {
            throw IllegalArgumentException("Daily allowance rate must be zero or positive")
        }
        appSettingRepository.save(AppSetting("daily_allowance_rate", rate.toString(), Instant.now()))
        return rate
    }
}
