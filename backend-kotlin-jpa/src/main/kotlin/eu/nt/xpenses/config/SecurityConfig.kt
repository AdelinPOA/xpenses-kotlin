package eu.nt.xpenses.config

import eu.nt.xpenses.security.JwtAuthenticationFilter
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.slf4j.LoggerFactory
import org.springframework.beans.factory.annotation.Value
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.HttpMethod
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.config.annotation.web.builders.HttpSecurity
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity
import org.springframework.security.config.http.SessionCreationPolicy
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder
import org.springframework.security.web.SecurityFilterChain
import org.springframework.security.web.authentication.UsernamePasswordAuthenticationFilter
import org.springframework.web.cors.CorsConfiguration
import org.springframework.web.cors.CorsConfigurationSource
import org.springframework.web.cors.UrlBasedCorsConfigurationSource
import org.springframework.web.filter.OncePerRequestFilter

import eu.nt.xpenses.security.RateLimitingFilter

@Configuration
@EnableWebSecurity
@EnableMethodSecurity
class SecurityConfig(
    private val jwtFilter: JwtAuthenticationFilter,
    private val rateLimitingFilter: RateLimitingFilter,
    @Value("\${cors.allowed-origins}")
    private val allowedOrigins: List<String>
) {

    @Bean
    fun passwordEncoder(): BCryptPasswordEncoder = BCryptPasswordEncoder()

    @Bean
    fun filterChain(http: HttpSecurity): SecurityFilterChain {
        http
            .cors { it.configurationSource(corsConfigurationSource()) }
            .csrf { it.disable() }
            .sessionManagement { it.sessionCreationPolicy(SessionCreationPolicy.STATELESS) }
            .exceptionHandling { exceptions ->
                exceptions.authenticationEntryPoint { _, response, _ ->
                    response.status = HttpServletResponse.SC_UNAUTHORIZED
                    response.contentType = "application/json;charset=UTF-8"
                    response.writer.write("""{"detail":"Unauthorized"}""")
                }
            }
            .authorizeHttpRequests { authorize ->
                authorize
                    .requestMatchers("/api/auth/login", "/api/auth/logout", "/api/auth/refresh").permitAll()
                    .requestMatchers("/api/health").permitAll()
                    .requestMatchers("/error").permitAll()
                    .requestMatchers("/actuator/health", "/actuator/info").permitAll()
                    .requestMatchers("/actuator/**").hasRole("mod")
                    .requestMatchers("/v3/api-docs/**", "/swagger-ui/**", "/swagger-ui.html").permitAll()
                    .requestMatchers("/api/settings/ocr/**").hasRole("mod")
                    .requestMatchers("/api/settings/ldap/**").hasRole("mod")
                    .requestMatchers("/api/settings/imap/**").hasRole("mod")
                    .requestMatchers("/api/settings/fx-providers/**").hasAnyRole("mod", "chef_finance")
                    .requestMatchers(HttpMethod.POST, "/api/users").hasRole("mod")
                    .requestMatchers(HttpMethod.POST, "/api/categories").hasRole("mod")
                    .requestMatchers(HttpMethod.PATCH, "/api/categories/**").hasRole("mod")
                    .requestMatchers(HttpMethod.DELETE, "/api/categories/**").hasRole("mod")
                    .requestMatchers("/api/insurance/**").authenticated()
                    .anyRequest().authenticated()
            }
            .addFilterBefore(csrfOriginRefererFilter(), UsernamePasswordAuthenticationFilter::class.java)
            .addFilterBefore(rateLimitingFilter, UsernamePasswordAuthenticationFilter::class.java)
            .addFilterBefore(jwtFilter, UsernamePasswordAuthenticationFilter::class.java)
        return http.build()
    }

    /**
     * Origin/Referer header verification as CSRF defense-in-depth.
     * For state-changing requests (POST, PUT, PATCH, DELETE), verifies the Origin or
     * Referer header matches an allowed origin. This prevents CSRF-style attacks when
     * CSRF tokens are disabled (stateless JWT auth).
     */
    @Bean
    fun csrfOriginRefererFilter(): OncePerRequestFilter {
        val log = LoggerFactory.getLogger("csrfOriginRefererFilter")
        val skipPaths = setOf(
            "/api/auth/login", "/api/auth/logout", "/api/auth/refresh",
            "/api/health", "/error",
            "/actuator/health", "/actuator/info"
        )
        return object : OncePerRequestFilter() {
            override fun doFilterInternal(request: HttpServletRequest, response: HttpServletResponse, chain: FilterChain) {
                val method = request.method
                val path = request.requestURI

                // Only check state-changing methods, skip public paths
                if (method in setOf("GET", "HEAD", "OPTIONS", "TRACE") ||
                    skipPaths.any { path.startsWith(it) }
                ) {
                    chain.doFilter(request, response)
                    return
                }

                val origin = request.getHeader("Origin")
                val referer = request.getHeader("Referer")

                if (origin.isNullOrBlank() && referer.isNullOrBlank()) {
                    log.warn("CSRF check blocked: no Origin/Referer for {} {}", method, path)
                    response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden: missing Origin header")
                    return
                }

                val requestOrigin = if (!origin.isNullOrBlank()) origin
                else extractOriginFromReferer(referer!!)

                val isAllowed = allowedOrigins.any { allowed ->
                    requestOrigin.equals(allowed.trim(), ignoreCase = true)
                }

                if (!isAllowed) {
                    log.warn("CSRF check blocked: origin {} not allowed for {} {}", requestOrigin, method, path)
                    response.sendError(HttpServletResponse.SC_FORBIDDEN, "Forbidden: origin not allowed")
                    return
                }

                chain.doFilter(request, response)
            }
        }
    }

    private fun extractOriginFromReferer(referer: String): String {
        return try {
            val uri = java.net.URI(referer)
            if (uri.scheme != null && uri.host != null) {
                val portStr = if (uri.port != -1) ":${uri.port}" else ""
                "${uri.scheme}://${uri.host}$portStr"
            } else referer
        } catch (_: Exception) {
            referer
        }
    }

    @Bean
    fun corsConfigurationSource(): CorsConfigurationSource {
        val configuration = CorsConfiguration()
        configuration.allowedOrigins = allowedOrigins
        configuration.allowedMethods = listOf("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
        configuration.allowedHeaders = listOf("Authorization", "Content-Type", "Cookie", "X-Requested-With", "Accept", "Idempotency-Key")
        configuration.exposedHeaders = listOf("Set-Cookie")
        configuration.allowCredentials = true
        
        val source = UrlBasedCorsConfigurationSource()
        source.registerCorsConfiguration("/**", configuration)
        return source
    }
}
