package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.Category
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface CategoryRepository : JpaRepository<Category, Int> {
    fun findByName(name: String): Category?
    fun findAllByIsActiveTrue(): List<Category>
}
