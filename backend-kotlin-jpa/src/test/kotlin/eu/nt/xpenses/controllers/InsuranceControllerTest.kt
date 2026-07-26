package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.model.AppSetting
import eu.nt.xpenses.model.InsuranceFile
import eu.nt.xpenses.repositories.AppSettingRepository
import eu.nt.xpenses.repositories.InsuranceFileRepository
import jakarta.persistence.EntityManager
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import java.nio.file.Files

class InsuranceControllerTest : IntegrationTestBase() {

    @Autowired
    private lateinit var entityManager: EntityManager
    @Autowired
    private lateinit var insuranceFileRepository: InsuranceFileRepository
    @Autowired
    private lateinit var appSettingRepository: AppSettingRepository

    @BeforeEach
    fun setupStorage() {
        // Create a temp directory for storage and configure it in the database
        val tempDir = Files.createTempDirectory("test-insurance-storage")
        val config = """{"providerType":"local","local":{"path":"${tempDir.toAbsolutePath()}"}}"""
        appSettingRepository.save(AppSetting(key = "storage_config", value = config))
        entityManager.flush()
    }

    private fun saveInsuranceFile(): InsuranceFile {
        val tech = userRepository.findByUsername("tech1")!!
        val mod = userRepository.findByUsername("mod1")!!
        return insuranceFileRepository.save(
            InsuranceFile(user = tech, title = "Health Insurance", filePath = "1/insurance/test.pdf", fileName = "test.pdf", fileSize = 1024, fileType = "application/pdf", uploadedBy = mod)
        )
    }

    @Test
    fun `GET files returns own files`() {
        saveInsuranceFile()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("tech1", "tech1")

        mockMvc.perform(get("/api/insurance").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$").isArray)
    }

    @Test
    fun `POST upload as manager returns 201`() {
        val tech = userRepository.findByUsername("tech1")!!
        val cookie = authHelper.loginAs("manager1", "manager1")
        val file = MockMultipartFile("file", "policy.pdf", "application/pdf", byteArrayOf(0x25, 0x50, 0x44, 0x46))

        mockMvc.perform(
            multipart("/api/insurance")
                .file(file)
                .param("title", "Life Insurance")
                .param("user_id", tech.id.toString())
                .cookie(cookie)
        )
            .andExpect(status().isCreated)
            .andExpect(jsonPath("$.title").value("Life Insurance"))
    }

    @Test
    fun `GET file by id returns 200`() {
        val f = saveInsuranceFile()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(get("/api/insurance/${f.id}").cookie(cookie))
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.title").value("Health Insurance"))
    }

    @Test
    fun `DELETE file as manager returns 204`() {
        val f = saveInsuranceFile()
        entityManager.flush()
        entityManager.clear()
        val cookie = authHelper.loginAs("manager1", "manager1")

        mockMvc.perform(delete("/api/insurance/${f.id}").cookie(cookie))
            .andExpect(status().isNoContent)
    }

    @Test
    fun `POST upload as technician returns 403`() {
        val tech = userRepository.findByUsername("tech1")!!
        val cookie = authHelper.loginAs("tech1", "tech1")
        val file = MockMultipartFile("file", "policy.pdf", "application/pdf", byteArrayOf(0x25, 0x50, 0x44, 0x46))

        mockMvc.perform(
            multipart("/api/insurance")
                .file(file)
                .param("title", "Life Insurance")
                .param("user_id", tech.id.toString())
                .cookie(cookie)
        )
            .andExpect(status().isForbidden)
    }

    @Test
    fun `GET files without cookie returns 403`() {
        mockMvc.perform(get("/api/insurance"))
            .andExpect(status().isForbidden)
    }
}
