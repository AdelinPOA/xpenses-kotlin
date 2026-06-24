package eu.nt.xpenses.services

import com.fasterxml.jackson.annotation.JsonProperty
import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import eu.nt.xpenses.models.AppSetting
import eu.nt.xpenses.models.User
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.RefreshTokenRepository
import eu.nt.xpenses.repositories.UserRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.*
import javax.naming.Context
import javax.naming.directory.InitialDirContext
import javax.naming.directory.SearchControls

data class LdapConfig(
    var enabled: Boolean = false,
    var host: String = "",
    var port: Int = 389,
    @JsonProperty("use_tls") var useTls: Boolean = false,
    @JsonProperty("bind_dn") var bindDn: String = "",
    @JsonProperty("bind_password") var bindPassword: String = "",
    @JsonProperty("base_dn") var baseDn: String = "",
    @JsonProperty("user_filter") var userFilter: String = "(objectClass=person)",
    @JsonProperty("attr_username") var attrUsername: String = "uid",
    @JsonProperty("attr_email") var attrEmail: String = "mail",
    @JsonProperty("attr_display_name") var attrDisplayName: String = "cn",
    @JsonProperty("attr_role") var attrRole: String = "memberOf",
    @JsonProperty("role_map") var roleMap: Map<String, String> = emptyMap(),
    @JsonProperty("default_role") var defaultRole: String = "technician",
    @JsonProperty("bind_password_invalid") var bindPasswordInvalid: Boolean = false
)

class LDAPUnavailableException(message: String, cause: Throwable? = null) : Exception(message, cause)
class LDAPBindException(message: String, cause: Throwable? = null) : Exception(message, cause)

@Service
class LdapService(
    private val appSettingRepository: AppSettingRepository,
    private val userRepository: UserRepository,
    private val refreshTokenRepository: RefreshTokenRepository,
    private val cryptoService: CryptoService,
    private val objectMapper: ObjectMapper
) {
    private val validRoles = setOf("technician", "manager", "chef_finance", "mod")

    fun getLdapConfig(): LdapConfig {
        val setting = appSettingRepository.findById("ldap_config").orElse(null) ?: return LdapConfig()
        return try {
            val config: LdapConfig = objectMapper.readValue(setting.value)
            val encryptedPw = config.bindPassword
            if (encryptedPw.isNotEmpty()) {
                try {
                    config.bindPassword = cryptoService.decrypt(encryptedPw, "xpenses-ldap-bind-pw")
                } catch (e: Exception) {
                    config.bindPassword = ""
                    config.bindPasswordInvalid = true
                }
            }
            config
        } catch (e: Exception) {
            LdapConfig()
        }
    }

    fun saveLdapConfig(config: LdapConfig) {
        val encryptedPw = if (config.bindPassword.isNotEmpty()) {
            cryptoService.encrypt(config.bindPassword, "xpenses-ldap-bind-pw")
        } else {
            ""
        }
        
        // Create a copy to avoid modifying original password field in memory
        val configToSave = config.copy(bindPassword = encryptedPw)
        val jsonValue = objectMapper.writeValueAsString(configToSave)
        
        val setting = AppSetting(
            key = "ldap_config",
            value = jsonValue,
            updatedAt = Instant.now()
        )
        appSettingRepository.save(setting)
    }

    fun testConnection(config: LdapConfig): Map<String, Any?> {
        if (config.host.isEmpty()) {
            return mapOf("ok" to false, "preview" to emptyList<Any>(), "error" to "No host configured")
        }
        return try {
            val ctx = bindServiceAccount(config)
            val searchControls = SearchControls().apply {
                searchScope = SearchControls.SUBTREE_SCOPE
                returningAttributes = arrayOf(config.attrUsername, config.attrEmail, config.attrDisplayName, config.attrRole)
                countLimit = 5
            }
            
            val results = ctx.search(config.baseDn, config.userFilter, searchControls)
            val preview = mutableListOf<Map<String, String>>()
            
            while (results.hasMore()) {
                val entry = results.next()
                val username = getAttributeValue(entry.attributes.get(config.attrUsername))
                val email = getAttributeValue(entry.attributes.get(config.attrEmail))
                val displayName = getAttributeValue(entry.attributes.get(config.attrDisplayName))
                val rolesAttr = entry.attributes.get(config.attrRole)
                val groups = mutableListOf<String>()
                if (rolesAttr != null) {
                    for (i in 0 until rolesAttr.size()) {
                        groups.add(rolesAttr.get(i).toString())
                    }
                }
                val mappedRole = mapRole(groups, config.roleMap, config.defaultRole)
                preview.add(mapOf(
                    "username" to username,
                    "email" to email,
                    "display_name" to displayName,
                    "mapped_role" to mappedRole
                ))
            }
            ctx.close()
            mapOf("ok" to true, "preview" to preview, "error" to null)
        } catch (e: Exception) {
            mapOf("ok" to false, "preview" to emptyList<Any>(), "error" to e.message)
        }
    }

    @Transactional
    fun syncUsers(config: LdapConfig): Map<String, Int> {
        if (!config.enabled) {
            throw IllegalArgumentException("LDAP is not enabled")
        }
        val ctx = bindServiceAccount(config)
        val searchControls = SearchControls().apply {
            searchScope = SearchControls.SUBTREE_SCOPE
            returningAttributes = arrayOf(config.attrUsername, config.attrEmail, config.attrDisplayName, config.attrRole)
        }
        
        val results = ctx.search(config.baseDn, config.userFilter, searchControls)
        val stats = mutableMapOf(
            "created" to 0,
            "updated" to 0,
            "deactivated" to 0,
            "skipped" to 0,
            "default_role_assigned" to 0
        )
        val directoryUsernames = mutableSetOf<String>()
        val now = Instant.now()
        
        while (results.hasMore()) {
            val entry = results.next()
            val username = getAttributeValue(entry.attributes.get(config.attrUsername))
            if (username.isEmpty()) continue
            
            directoryUsernames.add(username)
            val email = getAttributeValue(entry.attributes.get(config.attrEmail))
            val displayName = getAttributeValue(entry.attributes.get(config.attrDisplayName))
            
            val rolesAttr = entry.attributes.get(config.attrRole)
            val groups = mutableListOf<String>()
            if (rolesAttr != null) {
                for (i in 0 until rolesAttr.size()) {
                    groups.add(rolesAttr.get(i).toString())
                }
            }
            val role = mapRole(groups, config.roleMap, config.defaultRole)
            val usedDefault = role == config.defaultRole
            
            val user = userRepository.findByUsername(username)
            if (user == null) {
                val newUser = User(
                    username = username,
                    displayName = displayName.ifEmpty { username },
                    email = email.ifEmpty { null },
                    passwordHash = null,
                    authSource = "ldap",
                    role = role,
                    isActive = true,
                    createdAt = now,
                    updatedAt = now
                )
                userRepository.save(newUser)
                stats["created"] = stats["created"]!! + 1
                if (usedDefault) {
                    stats["default_role_assigned"] = stats["default_role_assigned"]!! + 1
                }
            } else if (user.authSource == "local") {
                stats["skipped"] = stats["skipped"]!! + 1
            } else {
                val changed = user.displayName != displayName ||
                        user.email != email ||
                        user.role != role ||
                        !user.isActive
                
                if (changed) {
                    user.displayName = displayName.ifEmpty { user.displayName }
                    user.email = email.ifEmpty { user.email }
                    user.role = role
                    user.isActive = true
                    user.updatedAt = now
                    userRepository.save(user)
                    stats["updated"] = stats["updated"]!! + 1
                }
            }
        }
        ctx.close()
        
        // Deactivate LDAP users no longer in the directory
        val ldapUsers = userRepository.findAll().filter { it.authSource == "ldap" && it.isActive }
        for (ldapUser in ldapUsers) {
            if (!directoryUsernames.contains(ldapUser.username)) {
                ldapUser.isActive = false
                ldapUser.updatedAt = now
                userRepository.save(ldapUser)
                refreshTokenRepository.deleteByUserId(ldapUser.id!!)
                stats["deactivated"] = stats["deactivated"]!! + 1
            }
        }
        
        return stats
    }

    fun authenticateLdap(username: String, password: String, config: LdapConfig): Boolean {
        if (password.isEmpty()) {
            throw LDAPBindException("Empty password not allowed")
        }
        try {
            val ctx = bindServiceAccount(config)
            try {
                val searchControls = SearchControls().apply {
                    searchScope = SearchControls.SUBTREE_SCOPE
                    returningAttributes = arrayOf("dn")
                }

                // Search for DN (safely escaping user input filter chars)
                val cleanUsername = escapeFilterChars(username)
                val filter = "(${config.attrUsername}=$cleanUsername)"
                val results = ctx.search(config.baseDn, filter, searchControls)

                try {
                    if (!results.hasMore()) {
                        throw LDAPBindException("User not found in directory")
                    }

                    val entry = results.next()
                    val userDn = entry.nameInNamespace

                    // Re-bind as user
                    val userEnv = Hashtable<String, String>().apply {
                        put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
                        val prefix = if (config.useTls) "ldaps" else "ldap"
                        put(Context.PROVIDER_URL, "$prefix://${config.host}:${config.port}")
                        put(Context.SECURITY_AUTHENTICATION, "simple")
                        put(Context.SECURITY_PRINCIPAL, userDn)
                        put(Context.SECURITY_CREDENTIALS, password)
                    }

                    val userCtx = InitialDirContext(userEnv)
                    try {
                        userCtx.close()
                    } catch (_: Exception) {}
                } finally {
                    try { results.close() } catch (_: Exception) {}
                }
                return true
            } finally {
                try { ctx.close() } catch (_: Exception) {}
            }
        } catch (e: LDAPBindException) {
            throw e
        } catch (e: Exception) {
            throw LDAPUnavailableException(e.message ?: "LDAP Server Unavailable", e)
        }
    }

    private fun bindServiceAccount(config: LdapConfig): InitialDirContext {
        val env = Hashtable<String, String>().apply {
            put(Context.INITIAL_CONTEXT_FACTORY, "com.sun.jndi.ldap.LdapCtxFactory")
            val prefix = if (config.useTls) "ldaps" else "ldap"
            put(Context.PROVIDER_URL, "$prefix://${config.host}:${config.port}")
            put(Context.SECURITY_AUTHENTICATION, "simple")
            put(Context.SECURITY_PRINCIPAL, config.bindDn)
            put(Context.SECURITY_CREDENTIALS, config.bindPassword)
            // Timeout settings (5 seconds)
            put("com.sun.jndi.ldap.connect.timeout", "5000")
            put("com.sun.jndi.ldap.read.timeout", "5000")
        }
        return try {
            InitialDirContext(env)
        } catch (e: Exception) {
            throw LDAPUnavailableException("Could not connect to LDAP: ${e.message}", e)
        }
    }

    private fun getAttributeValue(attr: javax.naming.directory.Attribute?): String {
        if (attr == null) return ""
        val value = attr.get()
        return value?.toString() ?: ""
    }

    private fun mapRole(groups: List<String>, roleMap: Map<String, String>, defaultRole: String): String {
        for (group in groups) {
            if (roleMap.containsKey(group)) {
                val mapped = roleMap[group]
                if (mapped in validRoles) {
                    return mapped!!
                }
            }
        }
        return defaultRole
    }

    private fun escapeFilterChars(s: String): String {
        val sb = StringBuilder()
        for (c in s) {
            when (c) {
                '\\' -> sb.append("\\5c")
                '*' -> sb.append("\\2a")
                '(' -> sb.append("\\28")
                ')' -> sb.append("\\29")
                '\u0000' -> sb.append("\\00")
                else -> sb.append(c)
            }
        }
        return sb.toString()
    }
}
