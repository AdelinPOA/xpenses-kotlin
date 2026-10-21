package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrJobActionOperation
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface OcrJobActionOperationRepository : JpaRepository<OcrJobActionOperation, Long> {
    fun findByUser_IdAndJob_IdAndActionAndRequestKey(
        userId: Int,
        jobId: Int,
        action: String,
        requestKey: String
    ): OcrJobActionOperation?
}
