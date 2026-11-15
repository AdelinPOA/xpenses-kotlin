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
        
        val caches = mapOf(
            "storage-config-cache" to Duration(TimeUnit.MINUTES, 5)
        )
        for ((name, expiry) in caches) {
            if (cacheManager.getCache<Any, Any>(name) == null) {
                val configuration = MutableConfiguration<Any, Any>()
                    .setExpiryPolicyFactory(CreatedExpiryPolicy.factoryOf(expiry))
                    .setStoreByValue(false)
                cacheManager.createCache(name, configuration)
            }
        }
        return cacheManager
    }

    @Bean
    fun cacheManager(jCacheManager: JCacheManager): CacheManager {
        return JCacheCacheManager(jCacheManager)
    }
}
