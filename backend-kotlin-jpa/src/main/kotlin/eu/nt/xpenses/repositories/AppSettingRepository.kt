package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.AppSetting
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface AppSettingRepository : JpaRepository<AppSetting, String>
