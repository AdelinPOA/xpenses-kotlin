package eu.nt.xpenses.models

import com.fasterxml.jackson.annotation.JsonManagedReference
import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "reports")
class Report(
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null,

    @Column(nullable = false)
    var title: String,

    @Column(nullable = false)
    var status: String = "draft",

    @JsonManagedReference
    @OneToMany(mappedBy = "report", cascade = [CascadeType.ALL], orphanRemoval = true, fetch = FetchType.LAZY)
    var expenses: MutableList<Expense> = mutableListOf(),

    @Column(name = "created_at", nullable = false)
    var createdAt: Instant = Instant.now()
)
