package eu.nt.xpenses

import org.springframework.boot.SpringApplication
import org.springframework.boot.autoconfigure.SpringBootApplication

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
