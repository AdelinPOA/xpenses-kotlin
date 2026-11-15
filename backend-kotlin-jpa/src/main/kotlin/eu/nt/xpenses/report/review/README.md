# Report Review Queue

## Overview
Read-only query and projection layer in `eu.nt.xpenses.report.review` for retrieving expense reports queued for manager or finance review.

## Interface
- `[ReviewQueueItem.kt:ReviewQueueItem]` — `data class` DTO representing a review queue row (`id`, `title`, `userId`, `userName`, `dateSubmitted`, `dateFrom`, `dateTo`, `description`, `expenseCount`, `totalAmountEur`, `currency`, `status`)
- `[ReviewQueueProjection.kt:ReviewQueueProjection]` — `data class` JPA projection matching the review queue repository query
- `[ReviewQueueReader.kt:ReviewQueueReader]` — Spring `@Service` reading and mapping queue items
- `[ReviewQueueReader.kt:read]` — `fun read(actor: User): List<ReviewQueueItem>`

## Invariants
- `[ReviewQueueReader.kt:read]` — requires `authorization.canManage(actor)` to be `true`, otherwise throws `ResponseStatusException(HttpStatus.FORBIDDEN, "Forbidden: manager access required")`
- `[ReviewQueueReader.kt:read]` — requires `actor.id` to be non-null, otherwise throws `ResponseStatusException(HttpStatus.UNAUTHORIZED, "Authenticated user has no ID")`

## Side Effects
- `[ReviewQueueReader.kt:read]` — DB read via `expenseReportRepository.findReviewQueue(actorId)`

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.ReviewQueueControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
