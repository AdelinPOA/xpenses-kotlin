package eu.nt.xpenses.config

import jakarta.validation.ConstraintViolationException
import org.slf4j.LoggerFactory
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException
import org.springframework.web.server.ResponseStatusException

@RestControllerAdvice
class ValidationExceptionHandler {

    private val log = LoggerFactory.getLogger(ValidationExceptionHandler::class.java)

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
        val message = "Malformed JSON request or invalid input format: ${ex.mostSpecificCause.message}"
        return ResponseEntity.status(400).body(mapOf("detail" to message))
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

    @ExceptionHandler(ResponseStatusException::class)
    fun handleResponseStatusException(ex: ResponseStatusException): ResponseEntity<Map<String, String>> {
        return ResponseEntity.status(ex.statusCode).body(mapOf("detail" to (ex.reason ?: ex.message)))
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

