package eu.nt.xpenses.config

import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Test
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.HttpInputMessage
import org.springframework.http.HttpStatus
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.mock.http.MockHttpInputMessage
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.server.ResponseStatusException

class ValidationExceptionHandlerTest {

    private val handler = ValidationExceptionHandler()

    @Test
    fun `maps optimistic locking and data integrity exceptions to 409 Conflict`() {
        val lockRes = handler.handleOptimisticLockingFailure(OptimisticLockingFailureException("row version mismatch"))
        assertEquals(409, lockRes.statusCode.value())

        val integrityRes = handler.handleDataIntegrityViolation(DataIntegrityViolationException("duplicate key"))
        assertEquals(409, integrityRes.statusCode.value())
    }

    @Test
    fun `maps upload size, multipart, method, and media type exceptions to proper 4xx codes`() {
        assertEquals(413, handler.handleMaxUploadSizeExceeded(MaxUploadSizeExceededException(1024)).statusCode.value())
        assertEquals(400, handler.handleMultipartException(MultipartException("bad part")).statusCode.value())
        assertEquals(405, handler.handleMethodNotSupported(HttpRequestMethodNotSupportedException("PATCH")).statusCode.value())
        assertEquals(415, handler.handleMediaTypeNotSupported(HttpMediaTypeNotSupportedException("text/xml")).statusCode.value())
    }

    @Test
    fun `does not leak internal Jackson details on malformed JSON`() {
        val input: HttpInputMessage = MockHttpInputMessage(ByteArray(0))
        val res = handler.handleHttpMessageNotReadableException(
            HttpMessageNotReadableException("com.fasterxml.jackson.databind.exc.MismatchedInputException internal details", input)
        )
        assertEquals(400, res.statusCode.value())
        assertFalse(res.body?.get("detail").orEmpty().contains("fasterxml"))
    }

    @Test
    fun `response status exception omits raw status prefix when reason is null`() {
        val res = handler.handleResponseStatusException(ResponseStatusException(HttpStatus.BAD_REQUEST))
        assertEquals(400, res.statusCode.value())
        assertEquals("Request failed", res.body?.get("detail"))
    }

    @Test
    fun `SafeMediaType prevents active HTML and SVG inline rendering`() {
        assertEquals("application/octet-stream", SafeMediaType.resolveSafeMimeType("evil.svg"))
        assertEquals("application/octet-stream", SafeMediaType.resolveSafeMimeType("payload.html"))
        assertEquals("image/webp", SafeMediaType.resolveSafeMimeType("receipt.WEBP"))
        assertEquals(true, SafeMediaType.safeDisposition("evil.svg", "application/octet-stream").isAttachment)
        assertEquals(true, SafeMediaType.safeDisposition("receipt.webp", "image/webp").isInline)
    }
}
