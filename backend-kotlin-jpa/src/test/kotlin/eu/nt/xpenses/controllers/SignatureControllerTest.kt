package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.http.MediaType
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.util.Base64

class SignatureControllerTest : IntegrationTestBase() {

    private val validPngBase64: String by lazy {
        // Minimal 1x1 red pixel PNG
        val pngBytes = byteArrayOf(
            0x89.toByte(), 0x50.toByte(), 0x4E.toByte(), 0x47.toByte(),
            0x0D.toByte(), 0x0A.toByte(), 0x1A.toByte(), 0x0A.toByte(),
            0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x0D.toByte(),
            0x49.toByte(), 0x48.toByte(), 0x44.toByte(), 0x52.toByte(),
            0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(),
            0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x01.toByte(),
            0x08.toByte(), 0x02.toByte(), 0x00.toByte(), 0x00.toByte(),
            0x00.toByte(), 0x90.toByte(), 0x77.toByte(), 0x53.toByte(),
            0xDE.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(),
            0x0C.toByte(), 0x49.toByte(), 0x44.toByte(), 0x41.toByte(),
            0x54.toByte(), 0x08.toByte(), 0xD7.toByte(), 0x63.toByte(),
            0xF8.toByte(), 0xCF.toByte(), 0xC0.toByte(), 0x00.toByte(),
            0x00.toByte(), 0x00.toByte(), 0x03.toByte(), 0x00.toByte(),
            0x01.toByte(), 0x36.toByte(), 0x28.toByte(), 0x1C.toByte(),
            0x00.toByte(), 0x00.toByte(), 0x00.toByte(), 0x00.toByte(),
            0x49.toByte(), 0x45.toByte(), 0x4E.toByte(), 0x44.toByte(),
            0xAE.toByte(), 0x42.toByte(), 0x60.toByte(), 0x82.toByte()
        )
        Base64.getEncoder().encodeToString(pngBytes)
    }

    @Test
    fun `PUT signature returns 200`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/users/me/signature")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"image":"data:image/png;base64,$validPngBase64"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.signature_path").isString)
    }

    @Test
    fun `GET signature returns 200 after upload`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/users/me/signature")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"image":"data:image/png;base64,$validPngBase64"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)

        mockMvc.perform(get("/api/users/me/signature").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(content().contentType("image/png"))
    }

    @Test
    fun `DELETE signature returns 204`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/users/me/signature")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"image":"data:image/png;base64,$validPngBase64"}""")
                .cookie(cookie)
        )
            .andExpect(status().isOk)

        mockMvc.perform(delete("/api/users/me/signature").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `PUT signature with invalid format returns 400`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(
            put("/api/users/me/signature")
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"image":"not-a-png"}""")
                .cookie(cookie)
        )
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `GET signature without cookie returns 401 Unauthorized`() {
        mockMvc.perform(get("/api/users/me/signature"))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `GET signature when none exists returns 404`() {
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/users/me/signature").cookie(cookie))
            .andExpect(status().isNotFound)
    }
}
