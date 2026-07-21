# Design Document: DB Performance Optimization

## 1. Paged Query in `ExpenseReportRepository`
Add JPQL paged query method:
```kotlin
    @Query("""
        SELECT r FROM ExpenseReport r
        WHERE (:userId IS NULL OR r.user.id = :userId)
          AND (:status IS NULL OR r.status = :status)
        ORDER BY r.createdAt DESC, r.id DESC
    """)
    @EntityGraph(attributePaths = ["user"])
    fun findAllWithFiltersPaged(
        @Param("userId") userId: Int?,
        @Param("status") status: String?,
        pageable: Pageable
    ): Page<ExpenseReport>
```

## 2. Paged Controller Handler
In `ReportController.kt`:
Delegate paged requests (`page != null`) directly to `findAllWithFiltersPaged(targetUid, status, pageable)`.

## 3. Dashboard Cleanup
In `DashboardController.kt`:
Remove redundant `.toLong()` on `countByUserId` return value.
