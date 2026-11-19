package eu.nt.xpenses.services

import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.springframework.http.HttpStatus
import org.springframework.http.MediaType
import org.springframework.test.web.client.MockRestServiceServer
import org.springframework.test.web.client.match.MockRestRequestMatchers.*
import org.springframework.test.web.client.response.MockRestResponseCreators.*
import org.springframework.web.client.RestClient
import java.net.InetAddress
import java.net.UnknownHostException

class OpenAiCompatibleClientTest {
    private val provider = OCRProviderConfig("provider", "Provider", "https://provider.example/v1", "synthetic-secret-api-key")
    private val publicResolver = PublicAddressDnsResolver { arrayOf(InetAddress.getByName("8.8.8.8")) }

    @Test
    fun `Spring can create and close the default secure transport without injected test seams`() {
        org.springframework.context.annotation.AnnotationConfigApplicationContext(OpenAiCompatibleClient::class.java).use { context ->
            assertNotNull(context.getBean(OpenAiCompatibleClient::class.java))
        }
    }

    @Test
    fun `base URL is extended to chat completions endpoint`() {
        val client = OpenAiCompatibleClient(publicResolver)
        try {
            assertEquals("https://provider.example/v1/chat/completions", client.validateBaseUrl(provider.baseUrl).toString())
            assertEquals(
                "https://provider.example/v1/chat/completions",
                client.validateBaseUrl("https://provider.example/v1/chat/completions/").toString(),
            )
        } finally {
            client.destroy()
        }
    }

    @Test
    fun `local credentials metadata and insecure endpoints are rejected`() {
        val client = OpenAiCompatibleClient()
        try {
            listOf(
                "https://127.0.0.1:11434/v1",
                "https://localhost:11434/v1",
                "https://169.254.169.254/latest/meta-data",
                "https://192.0.2.1/v1",
                "https://[::1]/v1",
                "https://metadata.google.internal/v1",
                "https://user:synthetic-secret-api-key@8.8.8.8/v1",
                "https://8.8.8.8/v1?key=synthetic-secret-api-key",
                "http://8.8.8.8/v1",
                "file:///etc/passwd",
            ).forEach { baseUrl ->
                val error = assertThrows(IllegalArgumentException::class.java) { client.validateBaseUrl(baseUrl) }
                assertFalse(error.toString().contains("synthetic-secret-api-key"))
                assertNull(error.cause)
            }
        } finally {
            client.destroy()
        }
    }

    @Test
    fun `resolver rejects unsafe IPv4 IPv6 and mixed DNS answers`() {
        listOf(
            "0.0.0.0",
            "10.0.0.1",
            "100.64.0.1",
            "127.0.0.1",
            "169.254.169.254",
            "172.16.0.1",
            "192.168.0.1",
            "198.18.0.1",
            "224.0.0.1",
            "::",
            "::1",
            "fc00::1",
            "fe80::1",
            "ff02::1",
            "::ffff:127.0.0.1",
            "2001:db8::1",
            "2001:0000:4136:e378:8000:63bf:3fff:fdd2",
            "2001:10::1",
            "2002:7f00:1::1",
        ).forEach { unsafe ->
            val resolver =
                PublicAddressDnsResolver {
                    arrayOf(InetAddress.getByName("8.8.8.8"), InetAddress.getByName(unsafe))
                }
            val error = assertThrows(UnknownHostException::class.java) { resolver.resolve("provider.example") }
            assertNull(error.cause)
        }
        val address = InetAddress.getByName("2606:4700:4700::1111")
        val valid = PublicAddressDnsResolver { arrayOf(address) }
        assertArrayEquals(arrayOf(address), valid.resolve("provider.example"))
        assertEquals("provider.example", valid.resolveCanonicalHostname("provider.example"))
    }

    @Test
    fun `connection revalidates changed DNS answers instead of connecting to a private address`() {
        var lookups = 0
        val resolver =
            PublicAddressDnsResolver {
                lookups++
                arrayOf(InetAddress.getByName(if (lookups == 1) "8.8.8.8" else "127.0.0.1"))
            }
        // Uses the real production Apache connection manager. URL validation gets a public
        // address; connection resolution gets loopback and must fail before opening a socket.
        val client = OpenAiCompatibleClient(resolver)
        try {
            val error =
                assertThrows(IllegalStateException::class.java) {
                    client.complete(provider, "model", "Return JSON", "sample")
                }
            assertEquals(2, lookups)
            assertEquals("AI provider connection or response failed", error.message)
            assertNull(error.cause)
        } finally {
            client.destroy()
        }
    }

    @Test
    fun `provider status errors never expose echoed credentials response body URL or raw causes`() {
        listOf(HttpStatus.UNAUTHORIZED, HttpStatus.TOO_MANY_REQUESTS, HttpStatus.INTERNAL_SERVER_ERROR).forEach { status ->
            val builder = RestClient.builder()
            val server = MockRestServiceServer.bindTo(builder).build()
            val client = OpenAiCompatibleClient(builder.build(), publicResolver)
            server
                .expect(requestTo("https://provider.example/v1/chat/completions"))
                .andExpect(header("Authorization", "Bearer synthetic-secret-api-key"))
                .andRespond(
                    withStatus(
                        status,
                    ).body("rejected synthetic-secret-api-key at https://provider.example/private").contentType(MediaType.TEXT_PLAIN),
                )

            val error = assertThrows(IllegalStateException::class.java) { client.complete(provider, "model", "Return JSON", "sample") }

            assertEquals("AI provider HTTP ${status.value()}", error.message)
            assertNull(error.cause)
            assertFalse(error.stackTraceToString().contains("synthetic-secret-api-key"))
            assertFalse(error.stackTraceToString().contains("https://provider.example"))
            server.verify()
        }
    }

    @Test
    fun `redirect response is rejected instead of returning or following arbitrary provider content`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val client = OpenAiCompatibleClient(builder.build(), publicResolver)
        server
            .expect(requestTo("https://provider.example/v1/chat/completions"))
            .andRespond(
                withStatus(
                    HttpStatus.TEMPORARY_REDIRECT,
                ).location(java.net.URI("https://127.0.0.1/private")).body("synthetic-secret-api-key"),
            )

        val error = assertThrows(IllegalStateException::class.java) { client.complete(provider, "model", "Return JSON", "sample") }

        assertEquals("AI provider HTTP 307", error.message)
        assertNull(error.cause)
        server.verify()
    }

    @Test
    fun `malformed response parsing cannot expose provider content through exception messages`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val client = OpenAiCompatibleClient(builder.build(), publicResolver)
        server
            .expect(requestTo("https://provider.example/v1/chat/completions"))
            .andRespond(withSuccess("{ synthetic-secret-api-key broken json", MediaType.APPLICATION_JSON))

        val error = assertThrows(IllegalStateException::class.java) { client.complete(provider, "model", "Return JSON", "sample") }

        assertEquals("AI provider connection or response failed", error.message)
        assertNull(error.cause)
        assertFalse(error.stackTraceToString().contains("synthetic-secret-api-key"))
        server.verify()
    }

    @Test
    fun `compatible chat response extracts model content`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val client = OpenAiCompatibleClient(builder.build(), publicResolver)
        server
            .expect(requestTo("https://provider.example/v1/chat/completions"))
            .andExpect(jsonPath("$.temperature").value(0.0))
            .andExpect(jsonPath("$.max_tokens").value(1024))
            .andExpect(jsonPath("$.response_format.type").value("json_object"))
            .andRespond(withSuccess("""{"choices":[{"message":{"content":"{\"amount\":12.34}"}}]}""", MediaType.APPLICATION_JSON))

        assertEquals("{\"amount\":12.34}", client.complete(provider, "model", "Return JSON", "sample"))
        server.verify()
    }

    @Test
    fun `400 rejection retries without optional parameters and status codes classify cooldown eligibility`() {
        val builder = RestClient.builder()
        val server = MockRestServiceServer.bindTo(builder).build()
        val client = OpenAiCompatibleClient(builder.build(), publicResolver)
        server
            .expect(requestTo("https://provider.example/v1/chat/completions"))
            .andExpect(jsonPath("$.response_format.type").value("json_object"))
            .andRespond(withStatus(HttpStatus.BAD_REQUEST))
        server
            .expect(requestTo("https://provider.example/v1/chat/completions"))
            .andExpect(jsonPath("$.response_format").doesNotExist())
            .andExpect(jsonPath("$.temperature").doesNotExist())
            .andExpect(jsonPath("$.max_tokens").doesNotExist())
            .andRespond(withSuccess("""{"choices":[{"message":{"content":"{\"amount\":5.00}"}}]}""", MediaType.APPLICATION_JSON))

        assertEquals("{\"amount\":5.00}", client.complete(provider, "model", "Return JSON", "sample"))
        server.verify()

        assertTrue(ProviderTransportException("AI provider HTTP 503", statusCode = 503).shouldCooldown)
        assertTrue(ProviderTransportException("AI provider HTTP 429", statusCode = 429).shouldCooldown)
        assertTrue(ProviderTransportException("AI provider request timed out", timedOut = true).shouldCooldown)
        assertFalse(ProviderTransportException("AI provider HTTP 401", statusCode = 401).shouldCooldown)
    }
}
