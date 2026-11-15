package eu.nt.xpenses.security

import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.atomic.AtomicLong

class InMemoryRateLimitStore(
    private val maxTrackedKeys: Int = 10_000
) : RateLimitStore {
    private class KeyBucket(
        val timestamps: ArrayDeque<Long> = ArrayDeque(),
        @Volatile var lastAccessSeq: Long = 0L
    )

    private val requestTimes = ConcurrentHashMap<String, KeyBucket>()
    private val accessSeq = AtomicLong(0L)

    override fun record(key: String, limit: Int, windowMillis: Long, nowMillis: Long): Int {
        val windowStart = nowMillis - windowMillis
        val cap = maxTrackedKeys.coerceAtLeast(1)
        if (requestTimes.size >= cap && !requestTimes.containsKey(key)) {
            evictExpiredAndOverflowingEntries(excludeKey = null, windowMillis = windowMillis, nowMillis = nowMillis, targetMax = cap - 1)
        }

        val bucket = requestTimes.computeIfAbsent(key) { KeyBucket() }
        val seq = accessSeq.incrementAndGet()

        val result = synchronized(bucket) {
            bucket.lastAccessSeq = seq
            while (bucket.timestamps.isNotEmpty() && bucket.timestamps.peekFirst() <= windowStart) {
                bucket.timestamps.removeFirst()
            }
            if (bucket.timestamps.size >= limit) {
                bucket.timestamps.size + 1
            } else {
                bucket.timestamps.addLast(nowMillis)
                bucket.timestamps.size
            }
        }

        if (requestTimes.size > cap) {
            evictExpiredAndOverflowingEntries(excludeKey = key, windowMillis = windowMillis, nowMillis = nowMillis, targetMax = cap)
        }

        return result
    }

    private fun evictExpiredAndOverflowingEntries(
        excludeKey: String?,
        windowMillis: Long,
        nowMillis: Long,
        targetMax: Int
    ) {
        val cutoff = nowMillis - windowMillis
        requestTimes.entries.forEach { entry ->
            if (entry.key == excludeKey) return@forEach
            val expired = synchronized(entry.value) {
                entry.value.timestamps.isEmpty() || entry.value.timestamps.peekLast() <= cutoff
            }
            if (expired) {
                requestTimes.remove(entry.key, entry.value)
            }
        }

        val overflow = requestTimes.size - targetMax.coerceAtLeast(0)
        if (overflow > 0) {
            // Evict least-recently-accessed keys rather than arbitrary ConcurrentHashMap hash-bucket order.
            requestTimes.entries
                .asSequence()
                .filter { it.key != excludeKey }
                .sortedBy { it.value.lastAccessSeq }
                .take(overflow)
                .toList()
                .forEach { requestTimes.remove(it.key, it.value) }
        }
    }
}
