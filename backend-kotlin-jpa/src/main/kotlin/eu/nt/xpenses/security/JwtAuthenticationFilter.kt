package eu.nt.xpenses.security

import eu.nt.xpenses.repositories.UserRepository
import jakarta.servlet.FilterChain
import jakarta.servlet.http.HttpServletRequest
import jakarta.servlet.http.HttpServletResponse
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.filter.OncePerRequestFilter

@Component
class JwtAuthenticationFilter(
    private val tokenProvider: JwtTokenProvider,
    private val userRepository: UserRepository
) : OncePerRequestFilter() {

    override fun doFilterInternal(
        request: HttpServletRequest,
        response: HttpServletResponse,
        filterChain: FilterChain
    ) {
        val cookies = request.cookies
        if (cookies != null) {
            val accessTokenCookie = cookies.find { it.name == "access_token" }
            if (accessTokenCookie != null) {
                val token = accessTokenCookie.value
                val claims = tokenProvider.decodeAccessToken(token)
                if (claims != null) {
                    val user = userRepository.findById(claims.userId).orElse(null)
                    if (user != null && user.isActive) {
                        val authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role}"))
                        val auth = UsernamePasswordAuthenticationToken(user, null, authorities)
                        SecurityContextHolder.getContext().authentication = auth
                        request.setAttribute("currentUser", user)
                    }
                }
            }
        }
        filterChain.doFilter(request, response)
    }
}
