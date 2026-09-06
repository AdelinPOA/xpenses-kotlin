package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import org.junit.jupiter.api.Test
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*

class BulkExpenseControllerTest : IntegrationTestBase() {

    @Test
    fun `POST bulk-upload without cookie returns 401 Unauthorized`() {
        val file = MockMultipartFile("files", "test.jpg", "image/jpeg", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte()))
        mockMvc.perform(multipart("/api/expenses/bulk-upload").file(file))
            .andExpect(status().isUnauthorized)
    }

    @Test
    fun `POST bulk-upload with more than 20 files returns 400 Bad Request`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        val builder = multipart("/api/expenses/bulk-upload")
        for (i in 1..21) {
            builder.file(MockMultipartFile("files", "test$i.jpg", "image/jpeg", byteArrayOf(0xFF.toByte(), 0xD8.toByte(), 0xFF.toByte(), 0xE0.toByte())))
        }

        mockMvc.perform(builder.cookie(cookie))
            .andExpect(status().isBadRequest)
    }

    @Test
    fun `POST bulk-upload with unsupported extensions reports error and skips OCR`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        val badFile = MockMultipartFile("files", "script.sh", "text/plain", "echo hello".toByteArray())

        mockMvc.perform(multipart("/api/expenses/bulk-upload").file(badFile).cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.errors[0].filename").value("script.sh"))
            .andExpect(jsonPath("$.errors[0].reason").value("File type not supported for OCR"))
            .andExpect(jsonPath("$.created").isEmpty)
    }

    @Test
    fun `POST bulk-upload with invalid magic bytes reports error without processing`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        val fakeJpg = MockMultipartFile("files", "fake.jpg", "image/jpeg", "malicious active script content".toByteArray())

        mockMvc.perform(multipart("/api/expenses/bulk-upload").file(fakeJpg).cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.errors[0].filename").value("fake.jpg"))
            .andExpect(jsonPath("$.errors[0].reason").value("Unsupported or invalid file format detected via magic bytes"))
            .andExpect(jsonPath("$.created").isEmpty)
    }
}
