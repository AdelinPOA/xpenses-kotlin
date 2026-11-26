package eu.nt.xpenses.controllers

import eu.nt.xpenses.dto.settings.OCRConfigUpdate
import eu.nt.xpenses.dto.settings.OCRModelUpdate
import eu.nt.xpenses.dto.settings.OCRProviderUpdate
import eu.nt.xpenses.services.OCRConfig
import eu.nt.xpenses.services.OCRModelConfig
import eu.nt.xpenses.services.OCRProviderConfig
import eu.nt.xpenses.services.OcrService
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.mockito.ArgumentCaptor
import org.mockito.Mockito.mock
import org.mockito.Mockito.verify
import org.mockito.Mockito.`when`
import tools.jackson.databind.ObjectMapper

class OcrSettingsControllerTest {
    private val ocrService = mock(OcrService::class.java)
    private val controller = OcrSettingsController(ocrService)

    @Test
    fun `OCR settings response masks all provider credentials`() {
        `when`(ocrService.getOcrConfig()).thenReturn(testConfig())

        val response = controller.readOcrSettings().body!!
        val json = ObjectMapper().valueToTree<tools.jackson.databind.JsonNode>(response)

        assertEquals("provider-1", json["providers"][0]["id"].asString())
        assertTrue(json["providers"][0]["api_key_set"].asBoolean())
        assertFalse(json.toString().contains("secret-api-key"))
        assertEquals(listOf("receipt-model"), json["receipt_model_chain"].values().map { it.asString() })
        assertEquals(listOf("email-model"), json["delegation_model_chain"].values().map { it.asString() })
    }

    @Test
    fun `OCR settings patch delegates atomic merge and masks response credentials`() {
        val current = testConfig()
        val body =
            OCRConfigUpdate(
                ocrEnabled = false,
                providers = listOf(OCRProviderUpdate("provider-1", "Provider One", "https://api.example.com/v1")),
                models =
                    listOf(
                        OCRModelUpdate("receipt-model", "provider-1", "vision-v2", "Vision V2", active = true),
                        OCRModelUpdate("email-model", "provider-1", "text-v2", "Text V2", active = true),
                    ),
                receiptModelChain = listOf("receipt-model"),
                delegationModelChain = listOf("email-model"),
            )

        `when`(ocrService.updateOcrConfig(body)).thenReturn(current)

        val response = controller.updateOcrSettings(body)

        verify(ocrService).updateOcrConfig(body)
        val json = ObjectMapper().valueToTree<tools.jackson.databind.JsonNode>(response.body)
        assertFalse(json.toString().contains("secret-api-key"))
        assertTrue(json["providers"][0]["api_key_set"].asBoolean())
        assertEquals(listOf("receipt-model"), json["receipt_model_chain"].values().map { it.asString() })
        assertEquals(listOf("email-model"), json["delegation_model_chain"].values().map { it.asString() })
    }

    private fun testConfig() =
        OCRConfig(
            providers = listOf(OCRProviderConfig("provider-1", "Provider One", "https://api.example.com/v1", "secret-api-key", true)),
            models =
                listOf(
                    OCRModelConfig("receipt-model", "provider-1", "vision-v2", "Vision V2", active = true, tested = true),
                    OCRModelConfig("email-model", "provider-1", "text-v2", "Text V2", active = true, tested = true),
                ),
            receiptModelChain = listOf("receipt-model"),
            delegationModelChain = listOf("email-model"),
        )
}
