package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import eu.nt.xpenses.models.OcrJob
import eu.nt.xpenses.repositories.OcrJobRepository
import org.slf4j.LoggerFactory
import org.springframework.scheduling.annotation.Async
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional

@Service
class AsyncOcrService(
    private val ocrService: OcrService,
    private val ocrJobRepository: OcrJobRepository,
    private val objectMapper: ObjectMapper
) {
    private val log = LoggerFactory.getLogger(AsyncOcrService::class.java)

    @Async("ocrTaskExecutor")
    @Transactional
    fun processOcr(jobId: Int, fileBytes: ByteArray, filename: String) {
        val job = ocrJobRepository.findById(jobId).orElse(null)
        if (job == null) {
            log.warn("OCR Job {} not found, aborting", jobId)
            return
        }
        
        try {
            job.status = "processing"
            ocrJobRepository.saveAndFlush(job)
            
            val result = ocrService.scanReceipt(fileBytes, filename)
            
            job.status = "completed"
            job.resultJson = objectMapper.writeValueAsString(result)
            ocrJobRepository.save(job)
            
        } catch (e: Exception) {
            log.error("OCR Job {} failed: {}", jobId, e.message, e)
            saveJobFailure(job.id!!, e.message ?: "Unknown error")
        }
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW)
    fun saveJobFailure(jobId: Int, errorMessage: String) {
        val job = ocrJobRepository.findById(jobId).orElse(null) ?: return
        job.status = "failed"
        job.errorMessage = errorMessage
        ocrJobRepository.save(job)
    }
}
