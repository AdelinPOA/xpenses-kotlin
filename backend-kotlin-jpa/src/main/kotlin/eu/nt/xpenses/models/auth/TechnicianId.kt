package eu.nt.xpenses.models.auth

/**
 * Value object representing a Technician / User identity in the domain.
 * Avoids passing full JPA entities with lazy associations and credentials.
 */
@JvmInline
value class TechnicianId(val value: Int) {
    override fun toString(): String = value.toString()
}
