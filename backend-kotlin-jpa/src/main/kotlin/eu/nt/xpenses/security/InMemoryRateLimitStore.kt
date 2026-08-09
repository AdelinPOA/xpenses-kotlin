package eu.nt.xpenses.security

import java.util.ArrayDeque
import java.util.concurrent.ConcurrentHashMap

class InMemoryRateLimitStore(
    private val maxTrackedKeys: Int = 10_000
) : RateLimitStore {
    private val requestTimes = ConcurrentHashMap<String, ArrayDeque<Long>>()

    override fun record(key: String, limit: Int, windowMillis: Long, nowMillis: Long): Int {
        evictExpiredAndOverflowingEntries(windowMillis, nowMillis)
        val windowStart = nowMillis - windowMillis
        val timestamps = requestTimes.computeIfAbsent(key) { ArrayDeque() }

        synchronized(timestamps) {
            while (timestamps.isNotEmpty() && timestamps.peekFirst() <= windowStart) {
                timestamps.removeFirst()
            }
            if (timestamps.size >= limit) {
                return timestamps.size + 1
            }
            timestamps.addLast(nowMillis)
            return timestamps.size
        }
    }

    private fun evictExpiredAndOverflowingEntries(windowMillis: Long, nowMillis: Long) {
        val cutoff = nowMillis - windowMillis
        requestTimes.entries.forEach { entry ->
            val expired = synchronized(entry.value) {
                entry.value.isEmpty() || entry.value.peekLast() <= cutoff
            }
            if (expired) {
                requestTimes.remove(entry.key, entry.value)
            }
        }

        val overflow = requestTimes.size - maxTrackedKeys.coerceAtLeast(1)
        if (overflow > 0) {
            requestTimes.keys.take(overflow).forEach(requestTimes::remove)
        }
    }
}
