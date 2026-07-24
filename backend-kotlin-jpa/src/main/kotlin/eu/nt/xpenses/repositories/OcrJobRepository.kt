package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.OcrJob
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface OcrJobRepository : JpaRepository<OcrJob, Int>
