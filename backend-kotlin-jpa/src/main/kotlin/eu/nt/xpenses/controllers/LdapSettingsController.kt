package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.services.LdapConfig
import eu.nt.xpenses.services.LdapService
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/settings/ldap")
@PreAuthorize("hasRole('mod')")
class LdapSettingsController(
    private val ldapService: LdapService
) {

    @GetMapping
    fun getLdap(): ResponseEntity<LdapConfigOut> {
        val config = ldapService.getLdapConfig()
        return ResponseEntity.ok(mapToOut(config))
    }

    @PatchMapping
    fun updateLdap(@RequestBody body: LdapConfigIn): ResponseEntity<*> {
        if (body.enabled && (body.host.isEmpty() || body.baseDn.isEmpty() || body.bindDn.isEmpty())) {
            return ResponseEntity.status(422).body(mapOf("detail" to "host, base_dn, and bind_dn are required when enabling LDAP"))
        }

        var password = body.bindPassword
        if (password == "" || password == "***") {
            val existing = ldapService.getLdapConfig()
            password = existing.bindPassword
        }

        val config = LdapConfig(
            enabled = body.enabled,
            host = body.host,
            port = body.port,
            useTls = body.useTls,
            bindDn = body.bindDn,
            bindPassword = password,
            baseDn = body.baseDn,
            userFilter = body.userFilter,
            attrUsername = body.attrUsername,
            attrEmail = body.attrEmail,
            attrDisplayName = body.attrDisplayName,
            attrRole = body.attrRole,
            roleMap = body.roleMap,
            defaultRole = body.defaultRole
        )
        ldapService.saveLdapConfig(config)
        return ResponseEntity.ok(mapToOut(config))
    }

    @PostMapping("/test")
    fun testLdap(@RequestBody body: LdapConfigIn): ResponseEntity<*> {
        var password = body.bindPassword
        if (body.useStoredPassword) {
            val existing = ldapService.getLdapConfig()
            password = existing.bindPassword
        }

        val config = LdapConfig(
            enabled = body.enabled,
            host = body.host,
            port = body.port,
            useTls = body.useTls,
            bindDn = body.bindDn,
            bindPassword = password,
            baseDn = body.baseDn,
            userFilter = body.userFilter,
            attrUsername = body.attrUsername,
            attrEmail = body.attrEmail,
            attrDisplayName = body.attrDisplayName,
            attrRole = body.attrRole,
            roleMap = body.roleMap,
            defaultRole = body.defaultRole
        )
        val result = ldapService.testConnection(config)
        return ResponseEntity.ok(result)
    }

    @PostMapping("/sync")
    fun syncLdap(): ResponseEntity<*> {
        val config = ldapService.getLdapConfig()
        if (!config.enabled) {
            return ResponseEntity.status(400).body(mapOf("detail" to "LDAP is not enabled"))
        }
        val stats = ldapService.syncUsers(config)
        return ResponseEntity.ok(stats)
    }

    private fun mapToOut(config: LdapConfig): LdapConfigOut {
        return LdapConfigOut(
            enabled = config.enabled,
            host = config.host,
            port = config.port,
            useTls = config.useTls,
            bindDn = config.bindDn,
            bindPassword = "***",
            baseDn = config.baseDn,
            userFilter = config.userFilter,
            attrUsername = config.attrUsername,
            attrEmail = config.attrEmail,
            attrDisplayName = config.attrDisplayName,
            attrRole = config.attrRole,
            roleMap = config.roleMap,
            defaultRole = config.defaultRole,
            bindPasswordInvalid = config.bindPasswordInvalid
        )
    }
}

data class LdapConfigIn(
    val enabled: Boolean = false,
    val host: String = "",
    val port: Int = 389,
    @JsonProperty("use_tls") val useTls: Boolean = false,
    @JsonProperty("bind_dn") val bindDn: String = "",
    @JsonProperty("bind_password") val bindPassword: String = "",
    @JsonProperty("base_dn") val baseDn: String = "",
    @JsonProperty("user_filter") val userFilter: String = "(objectClass=person)",
    @JsonProperty("attr_username") val attrUsername: String = "uid",
    @JsonProperty("attr_email") val attrEmail: String = "mail",
    @JsonProperty("attr_display_name") val attrDisplayName: String = "cn",
    @JsonProperty("attr_role") val attrRole: String = "memberOf",
    @JsonProperty("role_map") val roleMap: Map<String, String> = emptyMap(),
    @JsonProperty("default_role") val defaultRole: String = "technician",
    @JsonProperty("use_stored_password") val useStoredPassword: Boolean = false
)

data class LdapConfigOut(
    val enabled: Boolean = false,
    val host: String = "",
    val port: Int = 389,
    @JsonProperty("use_tls") val useTls: Boolean = false,
    @JsonProperty("bind_dn") val bindDn: String = "",
    @JsonProperty("bind_password") val bindPassword: String = "***",
    @JsonProperty("base_dn") val baseDn: String = "",
    @JsonProperty("user_filter") val userFilter: String = "(objectClass=person)",
    @JsonProperty("attr_username") val attrUsername: String = "uid",
    @JsonProperty("attr_email") val attrEmail: String = "mail",
    @JsonProperty("attr_display_name") val attrDisplayName: String = "cn",
    @JsonProperty("attr_role") val attrRole: String = "memberOf",
    @JsonProperty("role_map") val roleMap: Map<String, String> = emptyMap(),
    @JsonProperty("default_role") val defaultRole: String = "technician",
    @JsonProperty("bind_password_invalid") val bindPasswordInvalid: Boolean = false
)
