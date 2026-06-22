import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.Duration

val dateFrom = "2026-04-20"
val dateTo = "2026-05-22"
val formatter = DateTimeFormatter.ofPattern("yyyy-MM-dd")
val dFrom = LocalDate.parse(dateFrom.take(10), formatter)
val dTo = LocalDate.parse(dateTo.take(10), formatter)
println(dFrom)
println(dTo)
val days = Duration.between(dFrom.atStartOfDay(), dTo.atStartOfDay()).toDays() + 1
println(days)
