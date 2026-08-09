package eu.nt.xpenses.security

import org.springframework.beans.factory.annotation.Value
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class RateLimitStoreConfiguration {
    @Bean
    @ConditionalOnMissingBean(RateLimitStore::class)
    fun inMemoryRateLimitStore(
        @Value("\${rate-limiting.max-tracked-keys:10000}") maxTrackedKeys: Int
    ): RateLimitStore = InMemoryRateLimitStore(maxTrackedKeys)
}
