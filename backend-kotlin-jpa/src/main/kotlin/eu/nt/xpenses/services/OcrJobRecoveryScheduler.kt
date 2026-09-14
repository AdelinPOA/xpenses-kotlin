package eu.nt.xpenses.services

import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Scheduled
import org.springframework.stereotype.Component

@Component
class OcrJobRecoveryScheduler(
    private val pipeline: OcrJobPipeline
) {
    private val log = LoggerFactory.getLogger(OcrJobRecoveryScheduler::class.java)

    @Scheduled(fixedDelayString = "\${ocr.job.recovery-interval:15000}")
    fun recover() {
        val recovered = pipeline.recover(BATCH_SIZE)
        if (recovered > 0) log.debug("Dispatched {} durable OCR jobs", recovered)
    }

    companion object {
        private const val BATCH_SIZE = 3
    }
}
