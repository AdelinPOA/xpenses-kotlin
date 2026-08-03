package eu.nt.xpenses.controllers

import eu.nt.xpenses.model.User
import eu.nt.xpenses.report.review.ReviewQueueItem
import eu.nt.xpenses.report.review.ReviewQueueReader
import jakarta.servlet.http.HttpServletRequest
import org.springframework.http.HttpStatus
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController
import org.springframework.web.server.ResponseStatusException

@RestController
@RequestMapping("/api/review-queue")
class ReviewQueueController(
    private val reviewQueueReader: ReviewQueueReader
) {
    @GetMapping
    @Transactional(readOnly = true)
    fun getReviewQueue(request: HttpServletRequest): List<ReviewQueueItem> {
        val currentUser = request.getAttribute("currentUser") as? User
            ?: throw ResponseStatusException(HttpStatus.UNAUTHORIZED, "Not authenticated")

        return reviewQueueReader.read(currentUser)
    }
}
