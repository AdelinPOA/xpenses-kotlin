package eu.nt.xpenses.security

import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty
import org.springframework.data.redis.core.StringRedisTemplate
import org.springframework.data.redis.core.script.DefaultRedisScript
import org.springframework.stereotype.Component

@Component
@ConditionalOnProperty(prefix = "rate-limiting", name = ["store"], havingValue = "redis")
class RedisRateLimitStore(
    private val redisTemplate: StringRedisTemplate,
    @Value("\${rate-limiting.fail-closed:false}")
    private val failClosed: Boolean
) : RateLimitStore {
    private val log = LoggerFactory.getLogger(RedisRateLimitStore::class.java)
    private val fallback = InMemoryRateLimitStore()

    private val incrementScript = DefaultRedisScript<Long>(
        """
        local current = redis.call('INCR', KEYS[1])
        if current == 1 then
          redis.call('PEXPIRE', KEYS[1], ARGV[1])
        end
        return current
        """.trimIndent(),
        Long::class.java
    )

    override fun record(key: String, limit: Int, windowMillis: Long, nowMillis: Long): Int {
        val safeWindow = windowMillis.coerceAtLeast(1)
        val bucket = nowMillis / safeWindow
        val redisKey = "xpenses:rate-limit:$key:$bucket"

        return try {
            val count = redisTemplate.execute(
                incrementScript,
                listOf(redisKey),
                safeWindow.toString()
            ) ?: throw IllegalStateException("Redis returned no rate-limit count")
            count.toInt()
        } catch (e: Exception) {
            log.error("Rate-limit store unavailable for key {} (failClosed={})", key, failClosed, e)
            if (failClosed) limit + 1 else fallback.record(key, limit, safeWindow, nowMillis)
        }
    }
}
