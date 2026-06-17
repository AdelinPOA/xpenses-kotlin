package eu.nt.xpenses.config

import jakarta.validation.ConstraintViolationException
import org.springframework.http.ResponseEntity
import org.springframework.http.converter.HttpMessageNotReadableException
import org.springframework.web.bind.MethodArgumentNotValidException
import org.springframework.web.bind.MissingServletRequestParameterException
import org.springframework.web.bind.annotation.ExceptionHandler
import org.springframework.web.bind.annotation.RestControllerAdvice
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException

@RestControllerAdvice
class ValidationExceptionHandler {

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
}

