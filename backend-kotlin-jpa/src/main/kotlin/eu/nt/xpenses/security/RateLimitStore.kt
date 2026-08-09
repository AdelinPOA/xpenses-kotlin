package eu.nt.xpenses.security

interface RateLimitStore {
    /**
     * Records one request and returns the current count for the active window.
     */
    fun record(key: String, limit: Int, windowMillis: Long, nowMillis: Long): Int
}
