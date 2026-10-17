package eu.nt.xpenses.services

import com.fasterxml.jackson.databind.ObjectMapper
import com.fasterxml.jackson.module.kotlin.readValue
import com.fasterxml.jackson.module.kotlin.registerKotlinModule
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.repositories.AppSettingRepository
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertThrows
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentMatchers.anyString
import org.mockito.Mockito.doAnswer
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.verifyNoInteractions
import org.mockito.Mockito.verifyNoMoreInteractions
import java.util.Optional

class DelegationParsingSettingsServiceTest {
    private val mapper = ObjectMapper().registerKotlinModule()
    private val repository = mock(AppSettingRepository::class.java)
    private val service = DelegationParsingSettingsService(repository, mapper)

    @Test
    fun `missing settings return English defaults without writing any configuration`() {
        doAnswer { Optional.empty<AppSetting>() }.`when`(repository).findById("delegation_parsing_config")

        val config = service.getConfig()

        assertEquals(DelegationParsingConfig(), config)
        assertTrue(config.instructions.contains("Kundenauftrag or Auftrag"))
        assertTrue(config.outputInstructions.contains("English"))
        assertTrue(config.outputInstructions.contains("Order nr:"))
        verify(repository).findById("delegation_parsing_config")
        verifyNoMoreInteractions(repository)
    }

    @Test
    fun `guidance round trips using only its own app settings key and snake case JSON`() {
        val stored = mutableMapOf<String, AppSetting>()
        doAnswer { invocation -> Optional.ofNullable(stored[invocation.arguments[0] as String]) }
            .`when`(repository)
            .findById(anyString())
        doAnswer { invocation ->
            val setting = invocation.arguments[0] as AppSetting
            stored[setting.key] = setting
            setting
        }.`when`(repository).save(org.mockito.ArgumentMatchers.any(AppSetting::class.java) ?: AppSetting("", ""))
        val config = DelegationParsingConfig("Translate tasks into English", "Auftrag 00042 → Order nr: 00042", "One detail per line")

        assertEquals(config, service.saveConfig(config))
        assertEquals(config, service.getConfig())

        assertEquals(setOf("delegation_parsing_config"), stored.keys)
        val json = mapper.readTree(stored.getValue("delegation_parsing_config").value)
        assertEquals(config.outputInstructions, json["output_instructions"].asText())
        assertFalse(json.has("outputInstructions"))
        assertEquals(config, mapper.readValue<DelegationParsingConfig>(json.toString()))
        verify(repository).save(stored.getValue("delegation_parsing_config"))
        verify(repository).findById("delegation_parsing_config")
        verifyNoMoreInteractions(repository)
    }

    @Test
    fun `service rejects oversized guidance before writing even without MVC validation`() {
        listOf(
            DelegationParsingConfig(instructions = "x".repeat(12001)),
            DelegationParsingConfig(examples = "x".repeat(20001)),
            DelegationParsingConfig(outputInstructions = "x".repeat(6001)),
        ).forEach { invalid -> assertThrows(IllegalArgumentException::class.java) { service.saveConfig(invalid) } }

        verifyNoInteractions(repository)
    }

    @Test
    fun `exact limits and empty guidance remain valid`() {
        DelegationParsingConfig("x".repeat(12000), "x".repeat(20000), "x".repeat(6000)).validate()
        DelegationParsingConfig("", "", "").validate()
    }

    @Test
    fun `editable guidance cannot remove mandatory English and JSON prompt contract`() {
        val prompt = DelegationParsingConfig("Custom extraction", "Custom example", "Custom formatting").systemPrompt()

        assertTrue(prompt.contains("Custom extraction"))
        assertTrue(prompt.contains("Custom example"))
        assertTrue(prompt.contains("Custom formatting"))
        assertTrue(prompt.indexOf("Mandatory application contract") > prompt.indexOf("Custom formatting"))
        assertTrue(prompt.contains("values in English"))
        assertTrue(prompt.contains("Kundenauftrag or Auftrag"))
        assertTrue(prompt.contains("Order nr: <number>"))
        assertTrue(prompt.contains("date_from, date_to"))
    }
}
