package eu.nt.xpenses.controllers

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.services.DelegationParsingConfig
import eu.nt.xpenses.services.DelegationParsingSettingsService
import eu.nt.xpenses.services.EmailImportService
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OCRModelConfig
import eu.nt.xpenses.services.OCRProviderConfig
import eu.nt.xpenses.services.OcrService
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.verifyNoMoreInteractions
import org.mockito.Mockito.`when`
import org.springframework.context.annotation.AnnotationConfigApplicationContext
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration
import org.springframework.http.MediaType
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter
import org.springframework.security.access.AccessDeniedException
import org.springframework.security.authentication.AnonymousAuthenticationToken
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken
import org.springframework.security.config.annotation.method.configuration.EnableMethodSecurity
import org.springframework.security.core.authority.AuthorityUtils
import org.springframework.security.core.context.SecurityContextHolder
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.status
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.validation.beanvalidation.LocalValidatorFactoryBean

class DelegationParsingControllerTest {
    private val mapper = ObjectMapper().registerKotlinModule()
    private val settingsService = mock(DelegationParsingSettingsService::class.java)
    private val emailService = mock(EmailImportService::class.java)
    private val ocrService = mock(OcrService::class.java)
    private val controller = DelegationParsingController(settingsService, emailService, ocrService)
    private val settings = DelegationParsingConfig("English instructions", "Sample order", "One detail per line")
    private val parsed = mapOf("title" to "Delegation: Customer", "description" to "Order nr: 00042", "kundenauftrag" to "00042")
    private val body = "Auftrag 00042\nStarttermin 18.10.2026\nEndtermin 19.10.2026"

    @AfterEach
    fun clearSecurityContext() {
        SecurityContextHolder.clearContext()
    }

    @Test
    fun `settings HTTP contract round trips snake case without leaking other workflow settings`() {
        `when`(settingsService.getConfig()).thenReturn(settings)
        `when`(settingsService.saveConfig(settings)).thenReturn(settings)
        withMvc { mvc ->
            val read = mvc.perform(get("/api/settings/imap/parsing")).andExpect(status().isOk).andReturn()
            val readJson = mapper.readTree(read.response.contentAsString)
            assertEquals(settings.outputInstructions, readJson["output_instructions"].asText())
            assertFalse(readJson.has("outputInstructions"))
            assertEquals(setOf("instructions", "examples", "output_instructions"), readJson.fieldNames().asSequence().toSet())

            val saved =
                mvc
                    .perform(
                        patch(
                            "/api/settings/imap/parsing",
                        ).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(settings)),
                    ).andExpect(status().isOk)
                    .andReturn()
            assertEquals(readJson, mapper.readTree(saved.response.contentAsString))
        }
        verify(settingsService).getConfig()
        verify(settingsService).saveConfig(settings)
        verifyNoMoreInteractions(settingsService)
        verifyNoInteractions(ocrService, emailService)
    }

    @Test
    fun `preview uses unsaved guidance and email model chain without persisting or simulating`() {
        val config = config()
        val previewConfig = config.copy(delegationModelChain = listOf("fallback", "primary"))
        `when`(ocrService.getOcrConfig()).thenReturn(config)
        `when`(emailService.parseDelegationEmailWithModels(body, previewConfig, settings)).thenReturn(parsed)

        val response = controller.preview(DelegationPreviewIn(body, "ai", settings, listOf("fallback", "primary")))
        val result = response.body as DelegationPreviewOut

        assertEquals(200, response.statusCode.value())
        assertTrue(result.success)
        assertEquals(parsed, result.parsed)
        assertEquals("ai", result.activeParser)
        assertEquals(emptyList<String>(), result.warnings)
        assertNull(result.error)
        assertEquals(listOf("receipt"), previewConfig.receiptModelChain)
        verify(ocrService).getOcrConfig()
        verify(emailService).parseDelegationEmailWithModels(body, previewConfig, settings)
        verifyNoMoreInteractions(emailService, ocrService)
        verifyNoInteractions(settingsService)
    }

    @Test
    fun `AI failure is explicit with no local fallback report creation or settings write`() {
        val config = config()
        `when`(ocrService.getOcrConfig()).thenReturn(config)
        `when`(emailService.parseDelegationEmailWithModels(body, config, settings)).thenReturn(null)

        val result = controller.preview(DelegationPreviewIn(body, "ai", settings)).body as DelegationPreviewOut

        assertFalse(result.success)
        assertNull(result.parsed)
        assertEquals("ai", result.activeParser)
        assertTrue(result.error!!.contains("No local fallback"))
        verify(emailService).parseDelegationEmailWithModels(body, config, settings)
        verify(ocrService).getOcrConfig()
        verifyNoMoreInteractions(emailService, ocrService)
        verifyNoInteractions(settingsService)
    }

    @Test
    fun `omitted preview overrides use saved settings and configured email chain`() {
        val config = config()
        `when`(ocrService.getOcrConfig()).thenReturn(config)
        `when`(settingsService.getConfig()).thenReturn(settings)
        `when`(emailService.parseDelegationEmailWithModels(body, config, settings)).thenReturn(parsed)

        val result = controller.preview(DelegationPreviewIn(body)).body as DelegationPreviewOut

        assertTrue(result.success)
        verify(settingsService).getConfig()
        verify(ocrService).getOcrConfig()
        verify(emailService).parseDelegationEmailWithModels(body, config, settings)
        verifyNoMoreInteractions(settingsService, ocrService, emailService)
    }

    @Test
    fun `disabled AI and empty chain do not call any parser or save settings`() {
        listOf(config().copy(ocrEnabled = false), config().copy(delegationModelChain = emptyList())).forEach { config ->
            `when`(ocrService.getOcrConfig()).thenReturn(config)

            val result = controller.preview(DelegationPreviewIn(body, settings = settings)).body as DelegationPreviewOut

            assertFalse(result.success)
            assertNull(result.parsed)
            assertEquals("ai", result.activeParser)
            assertTrue(result.error!!.contains("disabled or no email model chain"))
        }
        verifyNoInteractions(emailService, settingsService)
    }

    @Test
    fun `unknown inactive untested and duplicate preview models are rejected before parsing`() {
        `when`(ocrService.getOcrConfig()).thenReturn(config())
        listOf(listOf("unknown"), listOf("inactive"), listOf("untested"), listOf("primary", "primary")).forEach { chain ->
            val response = controller.preview(DelegationPreviewIn(body, settings = settings, modelChain = chain))

            assertEquals(400, response.statusCode.value())
            assertTrue((response.body as Map<*, *>)["detail"].toString().contains("active, tested"))
        }
        verifyNoInteractions(emailService, settingsService)
    }

    @Test
    fun `local preview serializes warnings and never accesses AI settings or report simulation`() {
        `when`(emailService.parseDelegationEmailLocal(body)).thenReturn(parsed)
        withMvc { mvc ->
            val response =
                mvc
                    .perform(
                        post("/api/settings/imap/preview")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(DelegationPreviewIn(body, "local", settings, listOf("unused")))),
                    ).andExpect(status().isOk)
                    .andReturn()
            val json = mapper.readTree(response.response.contentAsString)
            assertTrue(json["success"].asBoolean())
            assertEquals("local", json["active_parser"].asText())
            assertFalse(json.has("activeParser"))
            assertEquals("00042", json["parsed"]["kundenauftrag"].asText())
            assertTrue(json["warnings"].isArray)
            assertTrue(json["warnings"][0].asText().contains("does not translate"))
        }
        verify(emailService).parseDelegationEmailLocal(body)
        verifyNoMoreInteractions(emailService)
        verifyNoInteractions(settingsService, ocrService)
    }

    @Test
    fun `invalid local sample reports failure instead of creating a draft`() {
        `when`(emailService.parseDelegationEmailLocal(body)).thenReturn(null)

        val result = controller.preview(DelegationPreviewIn(body, "local")).body as DelegationPreviewOut

        assertFalse(result.success)
        assertNull(result.parsed)
        assertTrue(result.error!!.contains("dates"))
        assertTrue(result.warnings.isNotEmpty())
        verify(emailService).parseDelegationEmailLocal(body)
        verifyNoMoreInteractions(emailService)
        verifyNoInteractions(settingsService, ocrService)
    }

    @Test
    fun `HTTP validation rejects oversized nested guidance body parser and model chain before any dependency call`() {
        val invalidSettings =
            listOf(
                settings.copy(instructions = "x".repeat(12001)),
                settings.copy(examples = "x".repeat(20001)),
                settings.copy(outputInstructions = "x".repeat(6001)),
            )
        withMvc { mvc ->
            invalidSettings.forEach { invalid ->
                mvc
                    .perform(
                        patch(
                            "/api/settings/imap/parsing",
                        ).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(invalid)),
                    ).andExpect(status().isBadRequest)
                mvc
                    .perform(
                        post("/api/settings/imap/preview")
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(mapper.writeValueAsString(DelegationPreviewIn(body, "local", invalid))),
                    ).andExpect(status().isBadRequest)
            }
            listOf(
                DelegationPreviewIn(" "),
                DelegationPreviewIn("x".repeat(50001)),
                DelegationPreviewIn(body, parser = "gemini"),
                DelegationPreviewIn(body, modelChain = List(21) { "model-$it" }),
            ).forEach { invalid ->
                mvc
                    .perform(
                        post(
                            "/api/settings/imap/preview",
                        ).contentType(MediaType.APPLICATION_JSON).content(mapper.writeValueAsString(invalid)),
                    ).andExpect(status().isBadRequest)
            }
        }
        verifyNoInteractions(settingsService, emailService, ocrService)
    }

    @Test
    fun `method security permits moderators and denies other roles for all three operations`() {
        AnnotationConfigApplicationContext(MethodSecurityConfig::class.java).use { context ->
            val secured = context.getBean(DelegationParsingController::class.java)
            val securedSettings = context.getBean(DelegationParsingSettingsService::class.java)
            val securedEmail = context.getBean(EmailImportService::class.java)
            `when`(securedSettings.getConfig()).thenReturn(settings)
            `when`(securedSettings.saveConfig(settings)).thenReturn(settings)
            `when`(securedEmail.parseDelegationEmailLocal(body)).thenReturn(parsed)

            listOf("technician", "chef_finance", "admin").forEach { role ->
                SecurityContextHolder.getContext().authentication =
                    UsernamePasswordAuthenticationToken.authenticated(
                        "user",
                        "unused",
                        AuthorityUtils.createAuthorityList("ROLE_$role"),
                    )
                assertThrows(AccessDeniedException::class.java) { secured.readSettings() }
                assertThrows(AccessDeniedException::class.java) { secured.saveSettings(settings) }
                assertThrows(AccessDeniedException::class.java) { secured.preview(DelegationPreviewIn(body, "local")) }
            }
            SecurityContextHolder.getContext().authentication =
                AnonymousAuthenticationToken(
                    "test-key",
                    "anonymous",
                    AuthorityUtils.createAuthorityList("ROLE_ANONYMOUS"),
                )
            assertThrows(AccessDeniedException::class.java) { secured.readSettings() }
            assertThrows(AccessDeniedException::class.java) { secured.saveSettings(settings) }
            assertThrows(AccessDeniedException::class.java) { secured.preview(DelegationPreviewIn(body, "local")) }
            verifyNoInteractions(securedSettings, securedEmail, context.getBean(OcrService::class.java))

            SecurityContextHolder.getContext().authentication =
                UsernamePasswordAuthenticationToken.authenticated(
                    "moderator",
                    "unused",
                    AuthorityUtils.createAuthorityList("ROLE_mod"),
                )
            assertEquals(settings, secured.readSettings())
            assertEquals(settings, secured.saveSettings(settings))
            assertTrue((secured.preview(DelegationPreviewIn(body, "local")).body as DelegationPreviewOut).success)
            verify(securedSettings).getConfig()
            verify(securedSettings).saveConfig(settings)
            verify(securedEmail).parseDelegationEmailLocal(body)
            verifyNoMoreInteractions(securedSettings, securedEmail)
        }
    }

    private fun withMvc(assertions: (org.springframework.test.web.servlet.MockMvc) -> Unit) {
        LocalValidatorFactoryBean().use { validator ->
            validator.afterPropertiesSet()
            val mvc =
                MockMvcBuilders
                    .standaloneSetup(controller)
                    .setValidator(validator)
                    .setMessageConverters(MappingJackson2HttpMessageConverter(mapper))
                    .build()
            assertions(mvc)
        }
    }

    private fun config() =
        OCRConfig(
            providers = listOf(OCRProviderConfig("provider", "Provider", "https://api.example.com/v1")),
            models =
                listOf(
                    OCRModelConfig("primary", "provider", "email-primary", "Email primary", active = true, tested = true),
                    OCRModelConfig("fallback", "provider", "email-fallback", "Email fallback", active = true, tested = true),
                    OCRModelConfig("inactive", "provider", "inactive", "Inactive", active = false, tested = true),
                    OCRModelConfig("untested", "provider", "untested", "Untested", active = true, tested = false),
                ),
            receiptModelChain = listOf("receipt"),
            delegationModelChain = listOf("primary"),
        )

    @Configuration(proxyBeanMethods = false)
    @EnableMethodSecurity
    class MethodSecurityConfig {
        @Bean
        fun settingsService(): DelegationParsingSettingsService = mock(DelegationParsingSettingsService::class.java)

        @Bean
        fun emailService(): EmailImportService = mock(EmailImportService::class.java)

        @Bean
        fun ocrService(): OcrService = mock(OcrService::class.java)

        @Bean
        fun controller(
            settings: DelegationParsingSettingsService,
            email: EmailImportService,
            ocr: OcrService,
        ): DelegationParsingController = DelegationParsingController(settings, email, ocr)
    }
}
