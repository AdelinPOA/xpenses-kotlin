package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.MileageRecord
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface MileageRecordRepository : JpaRepository<MileageRecord, Int> {
    fun findAllByReportId(reportId: Int): List<MileageRecord>
    fun findAllByUserId(userId: Int): List<MileageRecord>
}
