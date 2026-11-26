package eu.nt.xpenses.services

import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import java.math.BigDecimal
import java.time.Instant
import java.util.Optional

class AppSettingsServiceTest {
    private val appSettingRepository = mock(AppSettingRepository::class.java)
    private val appSettingsService = AppSettingsService(appSettingRepository)

    @Test
    fun `daily allowance rate defaults to 50 and rejects negative updates`() {
        `when`(appSettingRepository.findById("daily_allowance_rate")).thenReturn(Optional.empty())

        assertEquals(BigDecimal("50.00"), appSettingsService.getDailyAllowanceRate())
        assertThrows<IllegalArgumentException> {
            appSettingsService.updateDailyAllowanceRate(BigDecimal("-1.00"))
        }
    }

    @Test
    fun `mobile quick add fab defaults to false and persists updates`() {
        `when`(appSettingRepository.findById(AppSettingsService.MOBILE_QUICK_ADD_FAB_SETTING))
            .thenReturn(Optional.empty())
            .thenReturn(Optional.of(AppSetting(AppSettingsService.MOBILE_QUICK_ADD_FAB_SETTING, "true", Instant.now())))

        assertFalse(appSettingsService.isMobileQuickAddFabEnabled())
        assertTrue(appSettingsService.updateMobileQuickAddFab(true))
        assertTrue(appSettingsService.isMobileQuickAddFabEnabled())
        verify(appSettingRepository).save(org.mockito.ArgumentMatchers.any(AppSetting::class.java))
    }
}
