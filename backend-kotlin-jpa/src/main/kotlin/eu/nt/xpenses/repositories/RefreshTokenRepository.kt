package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.RefreshToken
import jakarta.persistence.LockModeType
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Lock
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
interface RefreshTokenRepository : JpaRepository<RefreshToken, Int> {
    fun findByTokenHash(tokenHash: String): RefreshToken?

    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT r FROM RefreshToken r JOIN FETCH r.user WHERE r.tokenHash = :tokenHash")
    fun findByTokenHashForUpdate(@Param("tokenHash") tokenHash: String): RefreshToken?

    fun deleteByUserId(userId: Int)

    @Modifying
    @Query(
        "DELETE FROM RefreshToken r WHERE r.user.id = :userId " +
            "AND (r.expiresAt < :now OR (r.rotatedAt IS NOT NULL AND r.rotatedAt < :graceCutoff))"
    )
    fun deleteExpiredAndRotated(
        @Param("userId") userId: Int,
        @Param("now") now: Instant,
        @Param("graceCutoff") graceCutoff: Instant,
    ): Int
}
