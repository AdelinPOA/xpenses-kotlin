package eu.nt.xpenses.services

import eu.nt.xpenses.model.User
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
     * Check if the current user can view a resource owned by ownerId.
     * Privileged users (chef_finance, mod, manager) can view anyone's resources.
     * Non-privileged users can only view their own resources.
     *
     * @param currentUser The user requesting access
     * @param ownerId The owner of the resource (null for global resources)
     * @return true if access is granted
     */
    fun canView(currentUser: User, ownerId: Int?): Boolean {
        // Privileged users can view anyone's resources
        if (currentUser.role in PRIVILEGED_ROLES) return true

        // Non-privileged users can only view their own resources
        return currentUser.id == ownerId
    }

    /**
     * Check if the current user can view all resources (not just their own).
     * Only privileged users (chef_finance, mod, manager) can view all.
     *
     * @param currentUser The user requesting access
     * @return true if the user can view all resources
     */
    fun canViewAll(currentUser: User): Boolean {
        return currentUser.role in PRIVILEGED_ROLES
    }

    /**
     * Check if the current user can manage (approve/reject) resources.
     * Only manager and chef_finance can manage.
     * NOTE: mod does NOT have manage permission (fix for previous bug).
     *
     * @param currentUser The user requesting access
     * @return true if the user can manage
     */
    fun canManage(currentUser: User): Boolean {
        return currentUser.role in MANAGE_ROLES
    }

    /**
     * Check if the current user can pay (process payments) for resources.
     * Only chef_finance can pay.
     * NOTE: mod does NOT have pay permission (fix for previous bug).
     *
     * @param currentUser The user requesting access
     * @return true if the user can pay
     */
    fun canPay(currentUser: User): Boolean {
        return currentUser.role in PAY_ROLES
    }

    /**
     * Resolve the effective user ID for list filtering.
     * Privileged users with all=true get null (meaning all users).
     * Non-privileged users always get their own ID.
     *
     * @param currentUser The user making the request
     * @param all Whether to request all resources
     * @return The effective user ID (null for all, non-null for specific user)
     */
    fun effectiveUserId(currentUser: User, all: Boolean): Int? {
        if (all && currentUser.role in PRIVILEGED_ROLES) {
            return null
        }
        return currentUser.id
    }

    /**
     * Check if the current user can mutate (edit, delete, duplicate, upload receipts for) a resource owned by ownerId.
     * Only the owner can mutate resources.
     *
     * @param currentUser The user requesting access
     * @param ownerId The owner of the resource
     * @return true if the user is the owner
     */
    fun canMutate(currentUser: User, ownerId: Int?): Boolean {
        return currentUser.id == ownerId
    }
}
