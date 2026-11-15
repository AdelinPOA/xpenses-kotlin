package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.User
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository

@Repository
interface UserRepository : JpaRepository<User, Int> {
    @Query("SELECT u.signaturePath FROM User u WHERE u.signaturePath IS NOT NULL")
    fun findAllSignaturePaths(): List<String>

    fun findByUsername(username: String): User?

    @Query(
        value = """
            SELECT * FROM users
            WHERE email IS NOT NULL
              AND TRIM(email) <> ''
              AND LOWER(TRIM(email)) = LOWER(TRIM(:email))
            ORDER BY is_active DESC, id ASC
            LIMIT 1
        """,
        nativeQuery = true
    )
    fun findByEmail(
        @Param("email") email: String,
    ): User?

    @Query("""
        SELECT u FROM User u 
        WHERE LOWER(TRIM(u.username)) = LOWER(TRIM(:identifier)) 
           OR (u.email IS NOT NULL AND LOWER(TRIM(u.email)) = LOWER(TRIM(:identifier)))
        ORDER BY u.isActive DESC, u.id ASC
    """)
    fun findByIdentifier(@Param("identifier") identifier: String): List<User>

    fun findAllByAuthSourceAndIsActive(
        authSource: String,
        isActive: Boolean,
    ): List<User>

    @Query("SELECT u FROM User u WHERE u.role IN :roles AND u.isActive = :isActive")
    fun findAllByRoleInAndIsActive(
        @Param("roles") roles: List<String>,
        @Param("isActive") isActive: Boolean,
    ): List<User>

    fun findAllByOrderByCreatedAt(): List<User>
}
