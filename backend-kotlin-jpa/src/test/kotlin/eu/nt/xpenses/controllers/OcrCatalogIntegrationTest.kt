package eu.nt.xpenses.controllers

import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.services.CryptoService
import eu.nt.xpenses.services.OCRProviderConfig
import eu.nt.xpenses.services.OpenAiCompatibleClient
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.any
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doReturn
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc
import org.springframework.http.MediaType
import org.springframework.security.test.context.support.WithMockUser
import org.springframework.test.annotation.DirtiesContext
import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoBean
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.testcontainers.containers.PostgreSQLContainer
import org.testcontainers.junit.jupiter.Container
import org.testcontainers.junit.jupiter.Testcontainers
import tools.jackson.databind.JsonNode
import tools.jackson.databind.ObjectMapper
import tools.jackson.databind.node.ObjectNode
import java.net.URI
import java.nio.file.Files

/** Real HTTP/security, ORM, PostgreSQL advisory locks and crypto; only provider network I/O is mocked. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Testcontainers
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
class OcrCatalogIntegrationTest {
    companion object {
        private const val SYNTHETIC_KEY = "integration-only-synthetic-provider-key"
        private const val ORIGIN = "http://localhost:3001"
        private val storageDirectory = Files.createTempDirectory("ocr-catalog-integration-")

        @Container
        @JvmStatic
        val postgres =
            PostgreSQLContainer("postgres:16-alpine")
                .withCreateContainerCmdModifier { command ->
                    command.hostConfig?.withMemory(256L * 1024 * 1024)?.withNanoCPUs(1_000_000_000L)
                }

        @DynamicPropertySource
        @JvmStatic
        fun properties(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
            registry.add("jwt.secret") { "integration-only-jwt-secret-at-least-32-characters" }
            registry.add("encryption.secret") { "integration-only-distinct-encryption-secret" }
            registry.add("rate-limiting.enabled") { "false" }
            registry.add("seed.demo.users") { "false" }
            registry.add("cors.allowed-origins") { ORIGIN }
            registry.add("signatures.dir") { storageDirectory.resolve("signatures").toString() }
            registry.add("storage.local.base-dir") { storageDirectory.resolve("receipts").toString() }
        }
    }

    @Autowired private lateinit var mockMvc: MockMvc

    @Autowired private lateinit var objectMapper: ObjectMapper

    @Autowired private lateinit var repository: AppSettingRepository

    @Autowired private lateinit var cryptoService: CryptoService

    @MockitoBean private lateinit var compatibleClient: OpenAiCompatibleClient

    @BeforeEach
    fun seedLegacyEncryptedConfiguration() {
        val legacyToken = cryptoService.encrypt(SYNTHETIC_KEY, "xpenses-gemini-ocr-pw")
        repository.saveAndFlush(
            AppSetting(
                "ocr_config",
                objectMapper.writeValueAsString(
                    mapOf(
                        "provider" to "gemini-3.1-flash-lite",
                        "ocr_enabled" to true,
                        "gemini_api_key" to legacyToken,
                    ),
                ),
            ),
        )
        doReturn(URI("https://api.example.com/v1/chat/completions"))
            .`when`(compatibleClient)
            .validateBaseUrl(anyString())
        doReturn("""{"amount":12.34,"currency":"EUR","merchant":"TEST SHOP","date":"2025-01-15"}""")
            .`when`(compatibleClient)
            .complete(
                any(OCRProviderConfig::class.java) ?: OCRProviderConfig("unused", "Unused", "https://api.example.com/v1"),
                anyString(),
                anyString(),
                any<Any?>(),
            )
    }

    @Test
    @WithMockUser(roles = ["mod"])
    fun `moderator migrates encrypted credentials tests a new model and persists ordered independent chains`() {
        val migrated = readSettings()
        assertTrue(migrated["providers"][0]["api_key_set"].asBoolean())
        assertFalse(migrated.toString().contains(SYNTHETIC_KEY))
        assertFalse(migrated["providers"][0].has("api_key"))
        val providerId = migrated["providers"][0]["id"].asString()
        val existingPrimary = migrated["receipt_model_chain"][0].asString()
        val originalDelegation = migrated["delegation_model_chain"].deepCopy()
        val patchBody = editableSettings(migrated)
        patchBody
            .withArray("models")
            .addObject()
            .put("id", "integration-vision")
            .put("provider_id", providerId)
            .put("model_id", "vision-integration-v2")
            .put("display_name", "Integration Vision")
            .put("active", false)

        // Executes the real transaction-scoped pg_advisory_xact_lock query and encrypted catalog write.
        val saved = patchSettings(patchBody)
        assertFalse(saved["models"].last()["tested"].asBoolean())
        assertTrue(saved["providers"][0]["api_key_set"].asBoolean())
        val persisted = objectMapper.readTree(repository.findById("ocr_config").orElseThrow().value)
        val storedToken = persisted["providers"][0]["api_key"].asString()
        assertNotEquals(SYNTHETIC_KEY, storedToken)
        assertEquals(SYNTHETIC_KEY, cryptoService.decrypt(storedToken, "xpenses-ai-provider-$providerId"))

        val untestedActivation = editableSettings(saved)
        (untestedActivation.withArray("models").last() as ObjectNode).put("active", true)
        mockMvc
            .perform(
                patch("/api/settings/ocr")
                    .header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(untestedActivation.toString()),
            ).andExpect(status().isBadRequest)

        mockMvc
            .perform(
                post("/api/settings/ocr/models/test")
                    .header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"model_id":"integration-vision"}"""),
            ).andExpect(status().isOk)
            .andExpect(jsonPath("$.success").value(true))

        val tested = readSettings()
        assertTrue(tested["models"].last()["tested"].asBoolean())
        val activatedBody = editableSettings(tested)
        (activatedBody.withArray("models").last() as ObjectNode).put("active", true)
        activatedBody.putArray("receipt_model_chain").add("integration-vision").add(existingPrimary)
        val activated = patchSettings(activatedBody)
        assertTrue(activated["models"].last()["active"].asBoolean())
        assertEquals(listOf("integration-vision", existingPrimary), activated["receipt_model_chain"].values().map { it.asString() })
        assertEquals(originalDelegation, activated["delegation_model_chain"])

        // A separate HTTP read proves the transaction committed; secrets remain write-only after migration.
        val reread = readSettings()
        assertEquals(activated, reread)
        assertFalse(
            repository
                .findById("ocr_config")
                .orElseThrow()
                .value
                .contains(SYNTHETIC_KEY),
        )
    }

    @Test
    @WithMockUser(roles = ["technician"])
    fun `technician cannot read update or test OCR settings`() {
        mockMvc.perform(get("/api/settings/ocr")).andExpect(status().isForbidden)
        mockMvc
            .perform(
                patch("/api/settings/ocr")
                    .header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"ocr_enabled":false}"""),
            ).andExpect(status().isForbidden)
        mockMvc
            .perform(
                post("/api/settings/ocr/models/test")
                    .header("Origin", ORIGIN)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"model_id":"integration-vision"}"""),
            ).andExpect(status().isForbidden)
    }

    private fun readSettings(): JsonNode =
        objectMapper.readTree(
            mockMvc
                .perform(get("/api/settings/ocr"))
                .andExpect(status().isOk)
                .andReturn()
                .response.contentAsString,
        )

    private fun patchSettings(body: ObjectNode): JsonNode =
        objectMapper.readTree(
            mockMvc
                .perform(
                    patch("/api/settings/ocr")
                        .header("Origin", ORIGIN)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body.toString()),
                ).andExpect(status().isOk)
                .andReturn()
                .response.contentAsString,
        )

    private fun editableSettings(source: JsonNode): ObjectNode {
        val editable = source.deepCopy() as ObjectNode
        editable.withArray("providers").forEach { (it as ObjectNode).remove("api_key_set") }
        editable.withArray("models").forEach { (it as ObjectNode).remove("tested") }
        return editable
    }
}
