package eu.nt.xpenses.repositories

import eu.nt.xpenses.model.UserVehicle
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.data.jpa.repository.Modifying
import org.springframework.data.jpa.repository.Query
import org.springframework.data.repository.query.Param
import org.springframework.stereotype.Repository
import java.time.Instant

@Repository
interface UserVehicleRepository : JpaRepository<UserVehicle, Int> {
    fun findAllByUserIdOrderByIsDefaultDescCreatedAtAsc(userId: Int): List<UserVehicle>

    fun findByIdAndUserId(id: Int, userId: Int): UserVehicle?

    fun countByUserId(userId: Int): Long

    @Query(value = "SELECT pg_advisory_xact_lock(hashtextextended('user-vehicles:' || :userId, 0))", nativeQuery = true)
    fun acquireUserLock(@Param("userId") userId: Int)

    @Modifying(flushAutomatically = true, clearAutomatically = true)
    @Query("UPDATE UserVehicle v SET v.isDefault = false, v.updatedAt = :now WHERE v.user.id = :userId AND v.isDefault = true")
    fun clearDefaultForUser(
        @Param("userId") userId: Int,
        @Param("now") now: Instant = Instant.now(),
    ): Int
}
