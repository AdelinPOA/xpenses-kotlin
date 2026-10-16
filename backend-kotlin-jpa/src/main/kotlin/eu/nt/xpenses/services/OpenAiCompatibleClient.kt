package eu.nt.xpenses.services

import org.apache.hc.client5.http.DnsResolver
import org.apache.hc.client5.http.config.ConnectionConfig
import org.apache.hc.client5.http.config.RequestConfig
import org.apache.hc.client5.http.impl.DefaultSchemePortResolver
import org.apache.hc.client5.http.impl.classic.CloseableHttpClient
import org.apache.hc.client5.http.impl.classic.HttpClients
import org.apache.hc.client5.http.impl.io.PoolingHttpClientConnectionManagerBuilder
import org.apache.hc.client5.http.impl.routing.DefaultRoutePlanner
import org.apache.hc.core5.util.Timeout
import org.springframework.beans.factory.DisposableBean
import org.springframework.http.MediaType
import org.springframework.http.client.HttpComponentsClientHttpRequestFactory
import org.springframework.stereotype.Service
import org.springframework.web.client.RestClient
import org.springframework.web.client.body
import java.net.Inet4Address
import java.net.Inet6Address
import java.net.InetAddress
import java.net.URI
import java.net.UnknownHostException

/** Minimal OpenAI Chat Completions adapter; every connection uses the public-address DNS policy. */
@Service
class OpenAiCompatibleClient private constructor(
    private val transport: Transport,
) : DisposableBean {
    constructor() : this(secureTransport(PublicAddressDnsResolver()))

    internal constructor(resolver: PublicAddressDnsResolver) : this(secureTransport(resolver))

    internal constructor(client: RestClient, resolver: PublicAddressDnsResolver) : this(Transport(client, resolver))

    private data class Transport(
        val client: RestClient,
        val resolver: PublicAddressDnsResolver,
        val resource: CloseableHttpClient? = null,
    )

    companion object {
        private fun secureTransport(resolver: PublicAddressDnsResolver): Transport {
            val manager =
                PoolingHttpClientConnectionManagerBuilder
                    .create()
                    .setDnsResolver(resolver)
                    // Keep the default TLS strategy: trusted certificates and original hostname verification.
                    .setDefaultConnectionConfig(
                        ConnectionConfig
                            .custom()
                            .setConnectTimeout(Timeout.ofSeconds(10))
                            .setSocketTimeout(Timeout.ofSeconds(60))
                            .build(),
                    ).setMaxConnTotal(20)
                    .setMaxConnPerRoute(5)
                    .build()
            val httpClient =
                HttpClients
                    .custom()
                    .setConnectionManager(manager)
                    // Explicit direct routes: system proxy settings must not bypass our DNS resolver.
                    .setRoutePlanner(DefaultRoutePlanner(DefaultSchemePortResolver.INSTANCE))
                    .disableRedirectHandling()
                    .disableAutomaticRetries()
                    .disableCookieManagement()
                    .disableAuthCaching()
                    .setDefaultRequestConfig(
                        RequestConfig
                            .custom()
                            .setConnectionRequestTimeout(Timeout.ofSeconds(10))
                            .setResponseTimeout(Timeout.ofSeconds(60))
                            .build(),
                    ).build()
            val client =
                RestClient
                    .builder()
                    .requestFactory(HttpComponentsClientHttpRequestFactory(httpClient))
                    .build()
            return Transport(client, resolver, httpClient)
        }
    }

    override fun destroy() {
        transport.resource?.close()
    }

    fun complete(
        provider: OCRProviderConfig,
        modelId: String,
        systemPrompt: String,
        userContent: Any?,
    ): String {
        try {
            val endpoint = chatCompletionsEndpoint(provider.baseUrl)
            val payload =
                mapOf(
                    "model" to modelId,
                    "messages" to
                        listOf(
                            mapOf("role" to "system", "content" to systemPrompt),
                            mapOf("role" to "user", "content" to userContent),
                        ),
                    "response_format" to mapOf("type" to "json_object"),
                )
            val request =
                transport.client
                    .post()
                    .uri(endpoint)
                    .contentType(MediaType.APPLICATION_JSON)
            if (provider.apiKey.isNotBlank()) request.header("Authorization", "Bearer ${provider.apiKey}")
            val response =
                request
                    .body(payload)
                    .retrieve()
                    // Do not let RestClient construct exceptions containing response bodies or URLs.
                    // Redirects are not followed and are failures, not parseable success responses.
                    .onStatus({ !it.is2xxSuccessful }) { _, error ->
                        throw ProviderTransportException("AI provider HTTP ${error.statusCode.value()}")
                    }.body<Map<String, Any?>>() ?: throw ProviderTransportException("AI provider returned an invalid response")
            val choices = response["choices"] as? List<*> ?: throw ProviderTransportException("AI provider returned an invalid response")
            val choice = choices.firstOrNull() as? Map<*, *> ?: throw ProviderTransportException("AI provider returned an invalid response")
            val message = choice["message"] as? Map<*, *> ?: throw ProviderTransportException("AI provider returned an invalid response")
            val text =
                when (val content = message["content"]) {
                    is String -> content
                    is List<*> -> content.mapNotNull { (it as? Map<*, *>)?.get("text") as? String }.joinToString("\n")
                    else -> throw ProviderTransportException("AI provider returned an invalid response")
                }
            if (text.isBlank()) throw ProviderTransportException("AI provider returned an invalid response")
            return text
        } catch (e: ProviderTransportException) {
            throw e
        } catch (_: Exception) {
            // Deliberately omit the cause: SSL/network/parser exceptions can contain credentials,
            // URLs, or arbitrary provider content and must not escape through logging or callers.
            throw ProviderTransportException("AI provider connection or response failed")
        }
    }

    fun validateBaseUrl(baseUrl: String): URI = chatCompletionsEndpoint(baseUrl)

    private fun chatCompletionsEndpoint(baseUrl: String): URI {
        val base =
            try {
                URI(baseUrl.trim())
            } catch (_: Exception) {
                throw IllegalArgumentException("Provider base URL is invalid")
            }
        val scheme = base.scheme?.lowercase()
        val host =
            base.host
                ?.removePrefix("[")
                ?.removeSuffix("]")
                ?.trimEnd('.')
                ?.lowercase()
        require(scheme == "https") { "Provider URL must use HTTPS" }
        require(!host.isNullOrBlank()) { "Provider URL must include a hostname" }
        require(base.port == -1 || base.port in 1..65535) { "Provider URL port is invalid" }
        require(base.userInfo == null && base.query == null && base.fragment == null) {
            "Provider URL cannot include credentials, query parameters, or fragments"
        }
        require(host != "localhost" && !host.endsWith(".localhost") && !host.endsWith(".local") && !host.endsWith(".internal")) {
            "Local provider URLs are not allowed"
        }
        require(host != "metadata" && !host.startsWith("metadata.")) { "Cloud metadata endpoints are not allowed" }
        try {
            transport.resolver.resolve(host)
        } catch (_: UnknownHostException) {
            throw IllegalArgumentException("Provider URL must resolve to public network addresses")
        }
        val path = base.path.trimEnd('/')
        val endpointPath = if (path.endsWith("/chat/completions")) path else "$path/chat/completions"
        return URI(scheme, null, host, base.port, endpointPath, null, null)
    }
}

/** Safe, bounded message only; deliberately carries no raw provider/network cause. */
internal class ProviderTransportException(
    message: String,
) : IllegalStateException(message)

/** The connection operator consumes these exact validated addresses; no second unguarded lookup. */
internal class PublicAddressDnsResolver(
    private val lookup: (String) -> Array<InetAddress> = InetAddress::getAllByName,
) : DnsResolver {
    override fun resolve(host: String): Array<InetAddress> {
        val addresses =
            try {
                lookup(host)
            } catch (_: Exception) {
                throw UnknownHostException("Provider hostname could not be resolved")
            }
        if (addresses.isEmpty() || addresses.any(::isUnsafeAddress)) {
            throw UnknownHostException("Provider hostname must resolve to public network addresses")
        }
        return addresses
    }

    override fun resolveCanonicalHostname(host: String): String {
        resolve(host)
        return host
    }

    private fun isUnsafeAddress(address: InetAddress): Boolean {
        if (address.isAnyLocalAddress || address.isLoopbackAddress || address.isLinkLocalAddress ||
            address.isSiteLocalAddress || address.isMulticastAddress
        ) {
            return true
        }
        if (address is Inet4Address) {
            val octets = address.address.map { it.toInt() and 0xff }
            val (first, second, third) = octets
            return first == 0 || first == 10 || first == 127 || first >= 224 ||
                (first == 100 && second in 64..127) ||
                (first == 172 && second in 16..31) ||
                (first == 192 && (second == 0 || second == 2 || (second == 88 && third == 99) || second == 168)) ||
                (first == 198 && (second in 18..19 || (second == 51 && third == 100))) ||
                (first == 203 && second == 0 && third == 113)
        }
        if (address is Inet6Address) {
            val bytes = address.address.map { it.toInt() and 0xff }
            val first = bytes[0]
            val second = bytes[1]
            return first !in 0x20..0x3f ||
                // IETF special-purpose block, including Teredo and ORCHID transition addresses.
                (first == 0x20 && second == 0x01 && bytes[2] < 0x02) ||
                (first == 0x20 && second == 0x01 && bytes[2] == 0x0d && bytes[3] == 0xb8) ||
                (first == 0x20 && second == 0x02) ||
                (first == 0x3f && second == 0xff && bytes[2] and 0xf0 == 0x00)
        }
        return true
    }
}
