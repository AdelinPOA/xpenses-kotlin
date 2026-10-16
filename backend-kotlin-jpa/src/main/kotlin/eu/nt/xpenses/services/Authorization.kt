package eu.nt.xpenses.services

import eu.nt.xpenses.model.User
import eu.nt.xpenses.models.auth.AuthenticatedActor
import org.springframework.stereotype.Component

/**
 * Centralized authorization module for role-based and ownership-based permission checks.
 *
 * Permission Model:
 * | Permission    | Roles                          | Notes |
 * |---------------|--------------------------------|-------|
 * | canView       | chef_finance, mod, manager     | Bypasses owner check |
 * | canViewAll    | chef_finance, mod, manager     | Can list all resources |
 * | canManage     | manager, chef_finance          | NOT mod |
 * | canPay        | chef_finance only              | NOT mod |
 * | ownerOnly     | owner only                     | Handled by canView returning false |
 */
@Component
class Authorization {

    companion object {
        const val ROLE_CHEF_FINANCE = "chef_finance"
        const val ROLE_MANAGER = "manager"
        const val ROLE_MOD = "mod"
        const val ROLE_TECHNICIAN = "technician"

        private val PRIVILEGED_ROLES = setOf(ROLE_CHEF_FINANCE, ROLE_MANAGER, ROLE_MOD)
        private val MANAGE_ROLES = setOf(ROLE_CHEF_FINANCE, ROLE_MANAGER)
        private val PAY_ROLES = setOf(ROLE_CHEF_FINANCE)
    }

    /**
     * Check if the authenticated actor can view a resource owned by ownerId.
     * Privileged users (chef_finance, mod, manager) can view anyone's resources.
     * Non-privileged users can only view their own resources.
     */
    fun canView(actor: AuthenticatedActor, ownerId: Int?): Boolean {
        if (actor.role in PRIVILEGED_ROLES) return true
        return actor.userId == ownerId
    }

    fun canView(currentUser: User, ownerId: Int?): Boolean =
        canView(AuthenticatedActor.fromUser(currentUser), ownerId)

    /**
     * Check if the authenticated actor can view all resources (not just their own).
     */
    fun canViewAll(actor: AuthenticatedActor): Boolean {
        return actor.role in PRIVILEGED_ROLES
    }

    fun canViewAll(currentUser: User): Boolean =
        canViewAll(AuthenticatedActor.fromUser(currentUser))

    /**
     * Check if the authenticated actor can manage (approve/reject) resources.
     * Only manager and chef_finance can manage.
     */
    fun canManage(actor: AuthenticatedActor): Boolean {
        return actor.role in MANAGE_ROLES
    }

    fun canManage(currentUser: User): Boolean =
        canManage(AuthenticatedActor.fromUser(currentUser))

    /**
     * Check if the authenticated actor can pay (process payments) for resources.
     * Only chef_finance can pay.
     */
    fun canPay(actor: AuthenticatedActor): Boolean {
        return actor.role in PAY_ROLES
    }

    fun canPay(currentUser: User): Boolean =
        canPay(AuthenticatedActor.fromUser(currentUser))

    /**
     * Resolve the effective user ID for list filtering.
     * Privileged users with all=true get null (meaning all users).
     * Non-privileged users always get their own ID.
     */
    fun effectiveUserId(actor: AuthenticatedActor, all: Boolean): Int? {
        if (all && actor.role in PRIVILEGED_ROLES) {
            return null
        }
        return actor.userId
    }

    fun effectiveUserId(currentUser: User, all: Boolean): Int? =
        effectiveUserId(AuthenticatedActor.fromUser(currentUser), all)

    /**
     * Check if the authenticated actor can mutate (edit, delete, duplicate, upload receipts for) a resource owned by ownerId.
     * Only the owner can mutate resources.
     */
    fun canMutate(actor: AuthenticatedActor, ownerId: Int?): Boolean {
        return actor.userId == ownerId
    }

    fun canMutate(currentUser: User, ownerId: Int?): Boolean =
        canMutate(AuthenticatedActor.fromUser(currentUser), ownerId)
}
