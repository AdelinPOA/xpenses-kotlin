package eu.nt.xpenses.security

import eu.nt.xpenses.repositories.UserRepository
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.core.authority.SimpleGrantedAuthority
import org.springframework.security.core.context.ReactiveSecurityContextHolder
import org.springframework.stereotype.Component
import org.springframework.web.server.ServerWebExchange
import org.springframework.web.server.WebFilter
import org.springframework.web.server.WebFilterChain
import reactor.core.publisher.Mono
import kotlinx.coroutines.reactor.mono

@Component
class JwtAuthenticationFilter(
    private val tokenProvider: JwtTokenProvider,
    private val userRepository: UserRepository
) : WebFilter {

    override fun filter(exchange: ServerWebExchange, chain: WebFilterChain): Mono<Void> {
        val accessTokenCookie = exchange.request.cookies.getFirst("access_token")
            ?: return chain.filter(exchange)

        val token = accessTokenCookie.value
        val claims = tokenProvider.decodeAccessToken(token) ?: return chain.filter(exchange)

        return mono {
            val user = userRepository.findById(claims.userId)
            if (user != null && user.isActive) {
                val authorities = listOf(SimpleGrantedAuthority("ROLE_${user.role}"))
                val auth = UsernamePasswordAuthenticationToken(user, null, authorities)
                exchange.attributes["currentUser"] = user
                auth
            } else {
                null
            }
        }.flatMap { auth ->
            if (auth != null) {
                chain.filter(exchange)
                    .contextWrite(ReactiveSecurityContextHolder.withAuthentication(auth))
            } else {
                chain.filter(exchange)
            }
        }
    }
}
