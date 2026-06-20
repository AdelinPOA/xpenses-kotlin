package eu.nt.xpenses.config

import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor
import java.util.concurrent.Executor
import java.util.concurrent.ThreadPoolExecutor

@Configuration
class AsyncConfig {

    /**
     * Spring Boot's TaskExecutionAutoConfiguration only creates the default
     * `applicationTaskExecutor` @ConditionalOnMissingBean(Executor::class). Declaring the
     * custom `ocrTaskExecutor` below suppresses that auto-configuration, so we must provide
     * `applicationTaskExecutor` explicitly — StorageService injects it by qualifier, and the
     * context fails to start without it.
     */
    @Bean(name = ["applicationTaskExecutor", "taskExecutor"])
    fun applicationTaskExecutor(): ThreadPoolTaskExecutor {
        val executor = ThreadPoolTaskExecutor()
        executor.corePoolSize = 4
        executor.maxPoolSize = 8
        executor.queueCapacity = 100
        executor.setThreadNamePrefix("AppTask-")
        executor.initialize()
        return executor
    }

    @Bean(name = ["ocrTaskExecutor"])
    fun ocrTaskExecutor(): Executor {
        val executor = ThreadPoolTaskExecutor()
        executor.corePoolSize = 2
        executor.maxPoolSize = 5
        executor.queueCapacity = 50
        executor.setThreadNamePrefix("OcrWorker-")
        // When queue is full, reject with exception instead of running in caller thread
        executor.setRejectedExecutionHandler(ThreadPoolExecutor.AbortPolicy())
        executor.initialize()
        return executor
    }
}
