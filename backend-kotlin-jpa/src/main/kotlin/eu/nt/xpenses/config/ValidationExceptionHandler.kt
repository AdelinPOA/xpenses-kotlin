package eu.nt.xpenses.config

import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.dao.DataIntegrityViolationException
import org.springframework.dao.OptimisticLockingFailureException
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.security.authorization.AuthorizationDeniedException
import org.springframework.web.HttpMediaTypeNotSupportedException
import org.springframework.web.HttpRequestMethodNotSupportedException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.multipart.MaxUploadSizeExceededException
import org.springframework.web.multipart.MultipartException
import org.springframework.web.multipart.support.MissingServletRequestPartException
import org.springframework.web.server.ResponseStatusException

class FxMarginsValidationException(
    val errors: Map<String, String>
) : RuntimeException("Invalid FX margins")

@RestControllerAdvice
class ValidationExceptionHandler {

    private val log = LoggerFactory.getLogger(ValidationExceptionHandler::class.java)

    @ExceptionHandler(FxMarginsValidationException::class)
    fun handleFxMarginsValidationException(ex: FxMarginsValidationException): ResponseEntity<Map<String, Any>> {
        return ResponseEntity.badRequest().body(mapOf(
            "detail" to "Invalid FX margins",
            "errors" to ex.errors
        ))
    }

    @ExceptionHandler(AuthorizationDeniedException::class)
    fun handleAuthorizationDeniedException(ex: AuthorizationDeniedException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(403).body(mapOf("detail" to "Access denied"))
    }

    @ExceptionHandler(MethodArgumentNotValidException::class)
    fun handleValidationException(ex: MethodArgumentNotValidException): ResponseEntity<Map<String, String>> {
        val fieldError = ex.bindingResult.fieldError
        val message = if (fieldError != null) {
            "${fieldError.field}: ${fieldError.defaultMessage ?: "invalid value"}"
        } else {
            "Validation failed"
        }
        return ResponseEntity.status(400).body(mapOf("detail" to message))
    }

    @ExceptionHandler(ConstraintViolationException::class)
    fun handleConstraintViolationException(ex: ConstraintViolationException): ResponseEntity<Map<String, String>> {
        val message = ex.constraintViolations.joinToString(", ") { 
            "${it.propertyPath}: ${it.message}"
        }
        return ResponseEntity.status(400).body(mapOf("detail" to message))
    }

    @ExceptionHandler(HttpMessageNotReadableException::class)
    fun handleHttpMessageNotReadableException(ex: HttpMessageNotReadableException): ResponseEntity<Map<String, String>> {
        log.debug("Malformed request body: {}", ex.mostSpecificCause.message)
        return ResponseEntity.status(400).body(mapOf("detail" to "Malformed JSON request or invalid input format"))
    }

    @ExceptionHandler(MissingServletRequestParameterException::class)
    fun handleMissingServletRequestParameterException(ex: MissingServletRequestParameterException): ResponseEntity<Map<String, String>> {
        val message = "Required request parameter '${ex.parameterName}' is missing"
        return ResponseEntity.status(400).body(mapOf("detail" to message))
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException::class)
    fun handleMethodArgumentTypeMismatchException(ex: MethodArgumentTypeMismatchException): ResponseEntity<Map<String, String>> {
        val message = "Parameter '${ex.name}' should be of type ${ex.requiredType?.simpleName ?: "unknown"}"
        return ResponseEntity.status(400).body(mapOf("detail" to message))
    }

    @ExceptionHandler(OptimisticLockingFailureException::class)
    fun handleOptimisticLockingFailure(ex: OptimisticLockingFailureException): ResponseEntity<Map<String, String>> {
        log.debug("Optimistic locking conflict: {}", ex.message)
        return ResponseEntity.status(409).body(
            mapOf("detail" to "The record was modified by another request. Please refresh and try again.")
        )
    }

    @ExceptionHandler(DataIntegrityViolationException::class)
    fun handleDataIntegrityViolation(ex: DataIntegrityViolationException): ResponseEntity<Map<String, String>> {
        log.warn("Data integrity violation: {}", ex.mostSpecificCause.message)
        return ResponseEntity.status(409).body(
            mapOf("detail" to "Operation conflicts with existing data constraints.")
        )
    }

    @ExceptionHandler(MaxUploadSizeExceededException::class)
    fun handleMaxUploadSizeExceeded(ex: MaxUploadSizeExceededException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(413).body(mapOf("detail" to "Uploaded file exceeds the maximum allowed size."))
    }

    @ExceptionHandler(MultipartException::class, MissingServletRequestPartException::class)
    fun handleMultipartException(ex: Exception): ResponseEntity<Map<String, String>> {
        log.debug("Multipart upload error: {}", ex.message)
        return ResponseEntity.status(400).body(mapOf("detail" to "Invalid or incomplete multipart upload request."))
    }

    @ExceptionHandler(HttpRequestMethodNotSupportedException::class)
    fun handleMethodNotSupported(ex: HttpRequestMethodNotSupportedException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(405).body(mapOf("detail" to "HTTP method '${ex.method}' is not supported for this endpoint."))
    }

    @ExceptionHandler(HttpMediaTypeNotSupportedException::class)
    fun handleMediaTypeNotSupported(ex: HttpMediaTypeNotSupportedException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(415).body(mapOf("detail" to "Unsupported media type."))
    }

    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatusException(ex: ResponseStatusException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(ex.statusCode).body(mapOf("detail" to (ex.reason ?: "Request failed")))
    }

    @ExceptionHandler(org.springframework.web.servlet.resource.NoResourceFoundException::class)
    fun handleNoResourceFoundException(ex: org.springframework.web.servlet.resource.NoResourceFoundException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(404).body(mapOf("detail" to (ex.message ?: "Resource not found")))
    }

    @ExceptionHandler(Exception::class)
    fun handleUnhandledException(ex: Exception): ResponseEntity<Map<String, String>> {
        log.error("Unhandled exception: ${ex.message}", ex)
        return ResponseEntity.status(500).body(mapOf("detail" to "Internal server error"))
    }
}
