package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.User
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface UserRepository : JpaRepository<User, Int> {
    fun findByUsername(username: String): User?

    @Query("SELECT u FROM User u WHERE LOWER(u.email) = LOWER(:email)")
    fun findByEmail(@Param("email") email: String): User?

    fun findAllByAuthSourceAndIsActive(authSource: String, isActive: Boolean): List<User>

    @Query("SELECT u FROM User u WHERE u.role IN :roles AND u.isActive = :isActive")
    fun findAllByRoleInAndIsActive(@Param("roles") roles: List<String>, @Param("isActive") isActive: Boolean): List<User>

    fun findAllByOrderByCreatedAt(): List<User>
}
