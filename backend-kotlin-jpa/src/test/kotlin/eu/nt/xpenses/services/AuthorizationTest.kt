package eu.nt.xpenses.services

import eu.nt.xpenses.model.User
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Nested
import org.junit.jupiter.api.Test

class AuthorizationTest {

    private lateinit var authorization: Authorization

    // Test users for each role
    private lateinit var technician: User
    private lateinit var manager: User
    private lateinit var chefFinance: User
    private lateinit var mod: User

    @BeforeEach
    fun setUp() {
        authorization = Authorization()

        technician = User(
            username = "tech1",
            displayName = "Technician 1"
        ).apply {
            id = 1
            role = Authorization.ROLE_TECHNICIAN
        }

        manager = User(
            username = "mgr1",
            displayName = "Manager 1"
        ).apply {
            id = 2
            role = Authorization.ROLE_MANAGER
        }

        chefFinance = User(
            username = "cfo1",
            displayName = "CFO 1"
        ).apply {
            id = 3
            role = Authorization.ROLE_CHEF_FINANCE
        }

        mod = User(
            username = "mod1",
            displayName = "Mod 1"
        ).apply {
            id = 4
            role = Authorization.ROLE_MOD
        }
    }

    @Nested
    inner class CanView {
        @Test
        fun `technician can view own resource`() {
            assertTrue(authorization.canView(technician, ownerId = 1))
        }

        @Test
        fun `technician cannot view other's resource`() {
            assertFalse(authorization.canView(technician, ownerId = 2))
        }

        @Test
        fun `manager can view any resource`() {
            assertTrue(authorization.canView(manager, ownerId = 1))
            assertTrue(authorization.canView(manager, ownerId = 99))
        }

        @Test
        fun `chef_finance can view any resource`() {
            assertTrue(authorization.canView(chefFinance, ownerId = 1))
            assertTrue(authorization.canView(chefFinance, ownerId = 99))
        }

        @Test
        fun `mod can view any resource`() {
            assertTrue(authorization.canView(mod, ownerId = 1))
            assertTrue(authorization.canView(mod, ownerId = 99))
        }

        @Test
        fun `privileged user can view global resource (null ownerId)`() {
            assertTrue(authorization.canView(manager, ownerId = null))
            assertTrue(authorization.canView(chefFinance, ownerId = null))
            assertTrue(authorization.canView(mod, ownerId = null))
        }

        @Test
        fun `technician cannot view global resource (null ownerId)`() {
            assertFalse(authorization.canView(technician, ownerId = null))
        }
    }

    @Nested
    inner class CanViewAll {
        @Test
        fun `technician cannot view all`() {
            assertFalse(authorization.canViewAll(technician))
        }

        @Test
        fun `manager can view all`() {
            assertTrue(authorization.canViewAll(manager))
        }

        @Test
        fun `chef_finance can view all`() {
            assertTrue(authorization.canViewAll(chefFinance))
        }

        @Test
        fun `mod can view all`() {
            assertTrue(authorization.canViewAll(mod))
        }
    }

    @Nested
    inner class CanManage {
        @Test
        fun `technician cannot manage`() {
            assertFalse(authorization.canManage(technician))
        }

        @Test
        fun `manager can manage`() {
            assertTrue(authorization.canManage(manager))
        }

        @Test
        fun `chef_finance can manage`() {
            assertTrue(authorization.canManage(chefFinance))
        }

        @Test
        fun `mod cannot manage (bug fix)`() {
            assertFalse(authorization.canManage(mod))
        }
    }

    @Nested
    inner class CanPay {
        @Test
        fun `technician cannot pay`() {
            assertFalse(authorization.canPay(technician))
        }

        @Test
        fun `manager cannot pay`() {
            assertFalse(authorization.canPay(manager))
        }

        @Test
        fun `chef_finance can pay`() {
            assertTrue(authorization.canPay(chefFinance))
        }

        @Test
        fun `mod cannot pay (bug fix)`() {
            assertFalse(authorization.canPay(mod))
        }
    }

    @Nested
    inner class EffectiveUserId {
        @Test
        fun `privileged user with all=true returns null`() {
            assertNull(authorization.effectiveUserId(manager, all = true))
            assertNull(authorization.effectiveUserId(chefFinance, all = true))
            assertNull(authorization.effectiveUserId(mod, all = true))
        }

        @Test
        fun `technician with all=true returns own id`() {
            assertEquals(1, authorization.effectiveUserId(technician, all = true))
        }

        @Test
        fun `any user with all=false returns own id`() {
            assertEquals(1, authorization.effectiveUserId(technician, all = false))
            assertEquals(2, authorization.effectiveUserId(manager, all = false))
            assertEquals(3, authorization.effectiveUserId(chefFinance, all = false))
            assertEquals(4, authorization.effectiveUserId(mod, all = false))
        }
    }

    @Nested
    inner class RoleConstants {
        @Test
        fun `role constants match expected values`() {
            assertEquals("chef_finance", Authorization.ROLE_CHEF_FINANCE)
            assertEquals("manager", Authorization.ROLE_MANAGER)
            assertEquals("mod", Authorization.ROLE_MOD)
            assertEquals("technician", Authorization.ROLE_TECHNICIAN)
        }
    }
}
