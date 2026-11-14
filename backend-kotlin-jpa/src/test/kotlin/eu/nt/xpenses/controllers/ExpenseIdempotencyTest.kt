package eu.nt.xpenses.controllers

import eu.nt.xpenses.IntegrationTestBase
import eu.nt.xpenses.dto.expense.ExpenseCreate
import eu.nt.xpenses.dto.expense.ExpenseOut
import eu.nt.xpenses.models.RawUpload
import eu.nt.xpenses.services.ExpenseService
import eu.nt.xpenses.services.IdempotentExpenseSaving
import eu.nt.xpenses.services.SaveIdempotencyService
import eu.nt.xpenses.services.StorageContext
import eu.nt.xpenses.services.StorageService
import org.junit.jupiter.api.AfterEach
import org.junit.jupiter.api.Assertions.*
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.http.MediaType
import org.springframework.jdbc.core.JdbcTemplate
import org.springframework.mock.web.MockMultipartFile
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*
import org.springframework.test.web.servlet.result.MockMvcResultMatchers.*
import org.springframework.transaction.annotation.Propagation
import org.springframework.transaction.annotation.Transactional
import tools.jackson.core.type.TypeReference
import tools.jackson.databind.ObjectMapper
import java.math.BigDecimal
import java.util.UUID
import java.util.concurrent.CountDownLatch
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/** Real commits are necessary to test stage recovery and competing connections. */
@Transactional(propagation = Propagation.NOT_SUPPORTED)
class ExpenseIdempotencyTest : IntegrationTestBase() {
    companion object {
        private val storageDirectory =
            java.nio.file.Files
                .createTempDirectory("expense-idempotency-")

        @JvmStatic
        @DynamicPropertySource
        fun isolateStorage(registry: DynamicPropertyRegistry) {
            registry.add("storage.location") { storageDirectory.toString() }
        }
    }

    @Autowired lateinit var mapper: ObjectMapper

    @Autowired lateinit var jdbc: JdbcTemplate

    @Autowired lateinit var saving: IdempotentExpenseSaving

    @Autowired lateinit var expenses: ExpenseService

    @Autowired lateinit var identities: SaveIdempotencyService

    @MockitoSpyBean lateinit var storage: StorageService

    private val prefix = "idem-test-${UUID.randomUUID()}"
    private val ids = mutableSetOf<Int>()
    private val png = byteArrayOf(0x89.toByte(), 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A)

    private fun file(name: String = "one.png") = MockMultipartFile("files", name, "image/png", png)

    private fun createBody(merchant: String = prefix) =
        ExpenseCreate(amount = BigDecimal("12.00"), currency = "EUR", date = "2026-06-10", merchant = merchant)

    private fun postExpense(
        key: String?,
        amount: Int = 12,
        username: String = "tech1",
    ): String {
        val builder =
            post("/api/expenses")
                .cookie(authHelper.loginAs(username, username))
                .contentType(MediaType.APPLICATION_JSON)
                .content("""{"amount":$amount,"currency":"EUR","date":"2026-06-10","merchant":"$prefix"}""")
        if (key != null) builder.header("Idempotency-Key", key)
        return mockMvc.perform(builder).andExpect(status().isCreated).andReturn().response.contentAsString.also {
            ids.add(mapper.readTree(it)["id"].asInt())
        }
    }

    @AfterEach
    fun cleanupCommittedData() {
        // Include a failed test's committed rows even if response parsing did not run.
        val owned = jdbc.queryForList("SELECT id FROM expenses WHERE merchant = ?", Int::class.java, prefix) + ids
        owned.distinct().forEach { id ->
            jdbc
                .queryForList("SELECT file_path FROM receipts WHERE expense_id = ?", String::class.java, id)
                .filterNotNull()
                .forEach { storage.deleteFile(it) }
            jdbc.update("DELETE FROM receipts WHERE expense_id = ?", id)
            jdbc.update("DELETE FROM expenses WHERE id = ?", id)
        }
        jdbc.update("DELETE FROM expense_save_requests WHERE request_key LIKE ?", "$prefix%")
        jdbc.update("DELETE FROM expense_reports WHERE title LIKE ?", "$prefix%")
    }

    @Test
    fun `lost create response replays original snapshot and rejects changed payload`() {
        val key = "$prefix:create"
        val first = postExpense(key)
        val id = mapper.readTree(first)["id"].asInt()
        mockMvc
            .perform(
                patch("/api/expenses/$id")
                    .cookie(authHelper.loginAs("tech1", "tech1"))
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"amount":19}"""),
            ).andExpect(status().isOk)
        assertEquals(first, postExpense(key), "Replay is the creation snapshot, not a second mutation or current state")
        mockMvc
            .perform(
                post("/api/expenses")
                    .cookie(authHelper.loginAs("tech1", "tech1"))
                    .header("Idempotency-Key", key)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"amount":99,"currency":"EUR","date":"2026-06-10","merchant":"$prefix"}"""),
            ).andExpect(status().isConflict)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM expenses WHERE merchant = ?", Long::class.java, prefix))
    }

    @Test
    fun `deleted expense never becomes a replacement when its create is replayed`() {
        val first = postExpense("$prefix:deleted")
        val id = mapper.readTree(first)["id"].asInt()
        mockMvc
            .perform(delete("/api/expenses/$id").cookie(authHelper.loginAs("tech1", "tech1")))
            .andExpect(status().isNoContent)
        assertEquals(first, postExpense("$prefix:deleted"))
        assertEquals(
            1L,
            jdbc.queryForObject("SELECT count(*) FROM expenses WHERE merchant = ? AND deleted = true", Long::class.java, prefix),
        )
    }

    @Test
    fun `keys are owner scoped and absent keys retain legacy create behavior`() {
        val first = mapper.readTree(postExpense("$prefix:shared"))["id"].asInt()
        val other = mapper.readTree(postExpense("$prefix:shared", username = "manager1"))["id"].asInt()
        assertNotEquals(first, other)
        assertNotEquals(mapper.readTree(postExpense(null))["id"].asInt(), mapper.readTree(postExpense(null))["id"].asInt())
    }

    @Test
    fun `receipt response loss and compatibility route replay one receipt`() {
        val id = mapper.readTree(postExpense("$prefix:create"))["id"].asInt()
        val cookie = authHelper.loginAs("tech1", "tech1")
        val key = "$prefix:receipt"
        val first =
            mockMvc
                .perform(multipart("/api/expenses/$id/receipts").file(file()).cookie(cookie).header("Idempotency-Key", key))
                .andExpect(status().isOk)
                .andReturn()
                .response.contentAsString
        val compat = MockMultipartFile("file", "one.png", "image/png", png)
        val replay =
            mockMvc
                .perform(multipart("/api/expenses/$id/receipt").file(compat).cookie(cookie).header("Idempotency-Key", key))
                .andExpect(status().isOk)
                .andReturn()
                .response.contentAsString
        assertEquals(first, replay)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        mockMvc
            .perform(multipart("/api/expenses/$id/receipts").file(file("different.png")).cookie(cookie).header("Idempotency-Key", key))
            .andExpect(status().isConflict)
        mockMvc
            .perform(
                multipart("/api/expenses/$id/receipts")
                    .file(file())
                    .cookie(authHelper.loginAs("manager1", "manager1"))
                    .header("Idempotency-Key", key),
            ).andExpect(status().isForbidden)
    }

    @Test
    fun `second receipt failure preserves first and repeated batch never duplicates it`() {
        val id = mapper.readTree(postExpense("$prefix:create"))["id"].asInt()
        val cookie = authHelper.loginAs("tech1", "tech1")
        val invalid = MockMultipartFile("files", "two.png", "image/png", "not an image".toByteArray())
        repeat(2) {
            mockMvc
                .perform(
                    multipart("/api/expenses/$id/receipts")
                        .file(file())
                        .file(invalid)
                        .cookie(cookie)
                        .header("Idempotency-Key", "$prefix:partial"),
                ).andExpect(status().isBadRequest)
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        }
        // A different payload cannot silently reuse the incomplete batch key.
        mockMvc
            .perform(
                multipart("/api/expenses/$id/receipts")
                    .file(file())
                    .file(file("two.png"))
                    .cookie(cookie)
                    .header("Idempotency-Key", "$prefix:partial"),
            ).andExpect(status().isConflict)
    }

    @Test
    fun `transient second receipt failure resumes original batch without duplicating first`() {
        val id = mapper.readTree(postExpense("$prefix:create"))["id"].asInt()
        val cookie = authHelper.loginAs("tech1", "tech1")
        var failSecond = true
        val storageAttempts = mutableMapOf<String, Int>()

        fun receiptContext(): StorageContext {
            org.mockito.ArgumentMatchers.eq(StorageContext.RECEIPT)
            return StorageContext.RECEIPT
        }

        fun anyUpload(): RawUpload {
            org.mockito.ArgumentMatchers.any(RawUpload::class.java)
            return RawUpload(png, "one.png", "image/png")
        }
        org.mockito.Mockito
            .doAnswer { invocation ->
                val name = invocation.getArgument<RawUpload>(1).originalFilename
                storageAttempts[name] = (storageAttempts[name] ?: 0) + 1
                if (name == "two.png" && failSecond) {
                    failSecond = false
                    throw org.springframework.web.server.ResponseStatusException(
                        org.springframework.http.HttpStatus.SERVICE_UNAVAILABLE,
                        "Transient storage failure",
                    )
                }
                invocation.callRealMethod()
            }.`when`(storage)
            .storeFile(receiptContext(), anyUpload(), org.mockito.ArgumentMatchers.anyInt())
        val request = {
            multipart("/api/expenses/$id/receipts")
                .file(file())
                .file(file("two.png"))
                .cookie(cookie)
                .header("Idempotency-Key", "$prefix:transient")
        }
        mockMvc.perform(request()).andExpect(status().isServiceUnavailable)
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        val firstReceiptId = jdbc.queryForObject("SELECT id FROM receipts WHERE expense_id = ?", Int::class.java, id)
        repeat(2) {
            mockMvc.perform(request()).andExpect(status().isOk).andExpect(jsonPath("$.length()").value(2))
        }
        assertEquals(2L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        assertEquals(
            firstReceiptId,
            jdbc.queryForObject("SELECT id FROM receipts WHERE expense_id = ? AND original_name = 'one.png'", Int::class.java, id),
        )
        assertEquals(mapOf("one.png" to 1, "two.png" to 2), storageAttempts)
    }

    @Test
    fun `parallel saves serialize to one durable identity`() {
        val user = userRepository.findByUsername("tech1")!!
        val executor = Executors.newFixedThreadPool(4)
        val start = CountDownLatch(1)
        try {
            val tasks =
                (1..4).map {
                    executor.submit<ExpenseOut> {
                        check(start.await(5, TimeUnit.SECONDS))
                        saving.create(createBody(), user, "$prefix:parallel")
                    }
                }
            start.countDown()
            val results = tasks.map { it.get(30, TimeUnit.SECONDS) }
            ids.addAll(results.map { it.id })
            assertEquals(1, results.map { it.id }.distinct().size)
            assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM expenses WHERE merchant = ?", Long::class.java, prefix))
        } finally {
            executor.shutdownNow()
        }
    }

    @Test
    fun `resource and successful identity roll back together`() {
        val user = userRepository.findByUsername("tech1")!!
        val type = object : TypeReference<ExpenseOut>() {}
        assertThrows<IllegalStateException> {
            identities.execute(user.id!!, "expense-create", "$prefix:rollback", identities.hash(createBody()), type) {
                expenses.createExpense(createBody(), user)
                error("response serialization or transaction-stage failure")
            }
        }
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM expenses WHERE merchant = ?", Long::class.java, prefix))
        assertEquals(
            0L,
            jdbc.queryForObject("SELECT count(*) FROM expense_save_requests WHERE request_key = ?", Long::class.java, "$prefix:rollback"),
        )
        ids.add(saving.create(createBody(), user, "$prefix:rollback").id)
    }

    @Test
    fun `bulk storage failure exposes known ID and attachment retry reuses initial key`() {
        var failNextReceipt = true

        fun receiptContext(): StorageContext {
            org.mockito.ArgumentMatchers.eq(StorageContext.RECEIPT)
            return StorageContext.RECEIPT
        }

        fun anyUpload(): RawUpload {
            org.mockito.ArgumentMatchers.any(RawUpload::class.java)
            return RawUpload(png, "one.png", "image/png")
        }
        org.mockito.Mockito
            .doAnswer { invocation ->
                if (failNextReceipt) {
                    failNextReceipt = false
                    throw IllegalStateException("Storage temporarily unavailable")
                }
                invocation.callRealMethod()
            }.`when`(storage)
            .storeFile(receiptContext(), anyUpload(), org.mockito.ArgumentMatchers.anyInt())
        val cookie = authHelper.loginAs("tech1", "tech1")
        val batchKey = "$prefix:recover"
        val first =
            mockMvc
                .perform(multipart("/api/expenses/bulk-upload").file(file()).cookie(cookie).header("Idempotency-Key", batchKey))
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.errors[0].file_index").value(0))
                .andExpect(jsonPath("$.errors[0].expense_id").isNumber)
                .andExpect(jsonPath("$.created[0].receipts").isEmpty)
                .andReturn()
                .response.contentAsString
        val id = mapper.readTree(first)["errors"][0]["expense_id"].asInt()
        ids.add(id)
        assertEquals(id, mapper.readTree(first)["created"][0]["id"].asInt())
        repeat(2) {
            mockMvc
                .perform(
                    multipart("/api/expenses/$id/receipts")
                        .file(file())
                        .cookie(cookie)
                        .header("Idempotency-Key", "$batchKey:receipt:0"),
                ).andExpect(status().isOk)
        }
        val replay =
            mockMvc
                .perform(multipart("/api/expenses/bulk-upload").file(file()).cookie(cookie).header("Idempotency-Key", batchKey))
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.errors").isEmpty)
                .andExpect(jsonPath("$.created[0].receipts[0].id").isNumber)
                .andReturn()
                .response.contentAsString
        assertEquals(id, mapper.readTree(replay)["created"][0]["id"].asInt())
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        org.mockito.Mockito
            .verify(ocrService, org.mockito.Mockito.times(1))
            .scanReceipt(png, "one.png")
    }

    @Test
    fun `bulk replay reports deleted source identity and continues unfinished sources`() {
        val user = userRepository.findByUsername("tech1")!!
        val files = listOf(file(), file("two.png"))
        val batchKey = "$prefix:deleted-bulk"
        val sources = saving.manifest(files)
        saving.bindManifest(user, "bulk-manifest", batchKey, sources)
        // Simulate interruption after source zero was durably created, before
        // source one was processed. The user then explicitly deletes that draft.
        val deletedId = saving.bulkCreate(0, sources[0], user, batchKey) { createBody() }.id
        ids.add(deletedId)
        expenses.deleteExpense(deletedId, user)
        val cookie = authHelper.loginAs("tech1", "tech1")
        val request = {
            multipart("/api/expenses/bulk-upload")
                .file(files[0])
                .file(files[1])
                .cookie(cookie)
                .header("Idempotency-Key", batchKey)
        }
        val first =
            mockMvc
                .perform(request())
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.errors.length()").value(1))
                .andExpect(jsonPath("$.errors[0].expense_id").value(deletedId))
                .andExpect(jsonPath("$.errors[0].file_index").value(0))
                .andExpect(jsonPath("$.created.length()").value(1))
                .andExpect(jsonPath("$.created[0].receipts.length()").value(1))
                .andReturn()
                .response.contentAsString
        val secondId = mapper.readTree(first)["created"][0]["id"].asInt()
        ids.add(secondId)
        assertNotEquals(deletedId, secondId)
        mockMvc
            .perform(request())
            .andExpect(status().isOk)
            .andExpect(jsonPath("$.errors[0].expense_id").value(deletedId))
            .andExpect(jsonPath("$.created[0].id").value(secondId))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM expenses WHERE id = ? AND deleted = true", Long::class.java, deletedId))
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, secondId))
        org.mockito.Mockito
            .verify(ocrService, org.mockito.Mockito.never())
            .scanReceipt(png, "one.png")
        org.mockito.Mockito
            .verify(ocrService, org.mockito.Mockito.times(1))
            .scanReceipt(png, "two.png")
    }

    @Test
    fun `CORS preflight permits keyed expense and receipt saves`() {
        listOf("/api/expenses", "/api/expenses/1/receipts", "/api/expenses/bulk-upload").forEach { path ->
            val response =
                mockMvc
                    .perform(
                        options(path)
                            .header("Origin", "http://localhost:3001")
                            .header("Access-Control-Request-Method", "POST")
                            .header("Access-Control-Request-Headers", "content-type,idempotency-key"),
                    ).andExpect(status().isOk)
                    .andExpect(header().string("Access-Control-Allow-Origin", "http://localhost:3001"))
                    .andReturn()
                    .response
            val allowed = response.getHeader("Access-Control-Allow-Headers")!!.split(',').map { it.trim().lowercase() }
            assertTrue(allowed.containsAll(listOf("content-type", "idempotency-key")))
        }
    }

    @Test
    fun `bulk replay skips OCR and returns authoritative receipt metadata`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        // Base OCR mock yields no fields: fallback draft is still durable.
        val builder = { multipart("/api/expenses/bulk-upload").file(file()).cookie(cookie).header("Idempotency-Key", "$prefix:bulk") }
        val first =
            mockMvc
                .perform(builder())
                .andExpect(status().isOk)
                .andExpect(jsonPath("$.created[0].receipts[0].id").isNumber)
                .andExpect(jsonPath("$.created[0].receipts.length()").value(1))
                .andReturn()
                .response.contentAsString
        val id = mapper.readTree(first)["created"][0]["id"].asInt()
        ids.add(id)
        val replay =
            mockMvc
                .perform(builder())
                .andExpect(status().isOk)
                .andReturn()
                .response.contentAsString
        assertEquals(id, mapper.readTree(replay)["created"][0]["id"].asInt())
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM receipts WHERE expense_id = ?", Long::class.java, id))
        org.mockito.Mockito
            .verify(ocrService, org.mockito.Mockito.times(1))
            .scanReceipt(png, "one.png")
        mockMvc
            .perform(
                multipart("/api/expenses/bulk-upload").file(file("changed.png")).cookie(cookie).header("Idempotency-Key", "$prefix:bulk"),
            ).andExpect(status().isConflict)
    }

    @Test
    fun `report create with expense_ids and Idempotency-Key replays atomically and rolls back invalid attach`() {
        val cookie = authHelper.loginAs("tech1", "tech1")
        val expenseJson = postExpense(null)
        val expenseId = mapper.readTree(expenseJson)["id"].asInt()
        val reportKey = "$prefix:report-create"
        val payload = """{"title":"$prefix:atomic","currency":"EUR","expense_ids":[$expenseId]}"""

        val first =
            mockMvc
                .perform(
                    post("/api/reports")
                        .cookie(cookie)
                        .header("Idempotency-Key", reportKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload),
                ).andExpect(status().isCreated)
                .andExpect(jsonPath("$.expenses.length()").value(1))
                .andReturn()
                .response.contentAsString
        val reportId = mapper.readTree(first)["id"].asInt()

        val replay =
            mockMvc
                .perform(
                    post("/api/reports")
                        .cookie(cookie)
                        .header("Idempotency-Key", reportKey)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(payload),
                ).andExpect(status().isCreated)
                .andReturn()
                .response.contentAsString
        assertEquals(reportId, mapper.readTree(replay)["id"].asInt())
        assertEquals(1L, jdbc.queryForObject("SELECT count(*) FROM expense_reports WHERE title = ?", Long::class.java, "$prefix:atomic"))

        mockMvc
            .perform(
                post("/api/reports")
                    .cookie(cookie)
                    .header("Idempotency-Key", reportKey)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"title":"$prefix:changed","currency":"EUR","expense_ids":[$expenseId]}"""),
            ).andExpect(status().isConflict)

        mockMvc
            .perform(
                post("/api/reports")
                    .cookie(cookie)
                    .contentType(MediaType.APPLICATION_JSON)
                    .content("""{"title":"$prefix:rollback","currency":"EUR","expense_ids":[999999999]}"""),
            ).andExpect(status().is4xxClientError)
        assertEquals(0L, jdbc.queryForObject("SELECT count(*) FROM expense_reports WHERE title = ?", Long::class.java, "$prefix:rollback"))
    }
}
