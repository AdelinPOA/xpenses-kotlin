package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.RefreshToken
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface RefreshTokenRepository : JpaRepository<RefreshToken, Int> {
    fun findByTokenHash(tokenHash: String): RefreshToken?
    fun deleteByUserId(userId: Int)
}
