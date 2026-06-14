package eu.nt.xpenses

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class XpensesApplication {
    companion object {
        @JvmStatic
        fun main(args: Array<String>) {
            runApplication<XpensesApplication>(*args)
        }
    }
}
