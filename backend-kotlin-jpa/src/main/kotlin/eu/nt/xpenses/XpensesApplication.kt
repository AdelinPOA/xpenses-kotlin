package eu.nt.xpenses

import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.cache.annotation.EnableCaching
import org.springframework.scheduling.annotation.EnableAsync
import org.springframework.scheduling.annotation.EnableScheduling

// @EnableAsync here is the single async-enablement point for the app; AsyncConfig only
// supplies the executor beans (see AsyncConfig.applicationTaskExecutor / ocrTaskExecutor).
@EnableAsync
@EnableScheduling
@EnableCaching
@SpringBootApplication
class XpensesApplication {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            val app = SpringApplication(XpensesApplication::class.java)
            app.mainApplicationClass = XpensesApplication::class.java
            app.run(*args)
        }
    }
}
