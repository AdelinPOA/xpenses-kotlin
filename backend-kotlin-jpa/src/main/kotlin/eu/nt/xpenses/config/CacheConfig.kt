package eu.nt.xpenses.config

import org.springframework.cache.CacheManager
import org.springframework.cache.jcache.JCacheCacheManager
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import javax.cache.Caching
import javax.cache.configuration.MutableConfiguration
import javax.cache.expiry.CreatedExpiryPolicy
import javax.cache.expiry.Duration
import java.util.concurrent.TimeUnit
import javax.cache.CacheManager as JCacheManager

@Configuration
class CacheConfig {

    @Bean
    fun jCacheManager(): JCacheManager {
        val provider = Caching.getCachingProvider("com.github.benmanes.caffeine.jcache.spi.CaffeineCachingProvider")
        val cacheManager = provider.cacheManager
        
        if (cacheManager.getCache<Any, Any>("rate-limit-cache") == null) {
            val configuration = MutableConfiguration<Any, Any>()
                .setExpiryPolicyFactory(CreatedExpiryPolicy.factoryOf(Duration(TimeUnit.HOURS, 1)))
                .setStoreByValue(false)
            cacheManager.createCache("rate-limit-cache", configuration)
        }
        return cacheManager
    }

    @Bean
    fun cacheManager(jCacheManager: JCacheManager): CacheManager {
        return JCacheCacheManager(jCacheManager)
    }
}
