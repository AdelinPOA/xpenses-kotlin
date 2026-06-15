package eu.nt.xpenses

import org.springframework.boot.autoconfigure.SpringBootApplication
import org.springframework.boot.runApplication

@SpringBootApplication
class XpensesApplication

fun main(args: Array<String>) {
	runApplication<XpensesApplication>(*args)
}
