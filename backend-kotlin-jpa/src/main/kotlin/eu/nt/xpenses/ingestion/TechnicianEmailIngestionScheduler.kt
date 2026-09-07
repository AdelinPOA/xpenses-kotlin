package eu.nt.xpenses.ingestion

import org.springframework.scheduling.annotation.Async
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class TechnicianEmailIngestionScheduler(
    private val ingestion: TechnicianEmailIngestion
) {
    @Async
    @Scheduled(fixedDelayString = "\${imap.poll-interval:300000}")
    fun poll() {
        ingestion.poll()
    }
}
