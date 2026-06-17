package eu.nt.xpenses.controllers

import com.fasterxml.jackson.annotation.JsonProperty
import eu.nt.xpenses.models.Category
import eu.nt.xpenses.repositories.CategoryRepository
import jakarta.validation.Valid
import jakarta.validation.constraints.NotBlank
import org.springframework.http.ResponseEntity
import org.springframework.security.access.prepost.PreAuthorize
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.bind.annotation.*

@RestController
@RequestMapping("/api/categories")
class CategoryController(
    private val categoryRepository: CategoryRepository
) {

    @GetMapping
    fun listCategories(
        @RequestParam(name = "active_only", defaultValue = "true") activeOnly: Boolean
    ): ResponseEntity<List<Category>> {
        val categories = if (activeOnly) {
            categoryRepository.findAllByIsActiveTrue()
        } else {
            categoryRepository.findAll()
        }
        return ResponseEntity.ok(categories.sortedBy { it.name })
    }

    @PostMapping
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun createCategory(@Valid @RequestBody body: CategoryCreateRequest): ResponseEntity<*> {
        val existing = categoryRepository.findByName(body.name)
        if (existing != null) {
            return ResponseEntity.status(409).body(mapOf("detail" to "Category name already exists"))
        }
        val category = Category(
            name = body.name,
            limitAmount = body.limitAmount
        )
        val saved = categoryRepository.save(category)
        return ResponseEntity.status(201).body(saved)
    }

    @PatchMapping("/{categoryId}")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun updateCategory(
        @PathVariable categoryId: Int,
        @Valid @RequestBody body: CategoryUpdateRequest
    ): ResponseEntity<*> {
        val category = categoryRepository.findById(categoryId).orElse(null)
            ?: return ResponseEntity.status(404).body(mapOf("detail" to "Category not found"))

        if (body.name != null) {
            val existing = categoryRepository.findByName(body.name)
            if (existing != null && existing.id != categoryId) {
                return ResponseEntity.status(409).body(mapOf("detail" to "Category name already exists"))
            }
            category.name = body.name
        }
        if (body.limitAmount != null) {
            category.limitAmount = body.limitAmount
        }
        if (body.isActive != null) {
            category.isActive = body.isActive
        }

        val saved = categoryRepository.save(category)
        return ResponseEntity.ok(saved)
    }

    @DeleteMapping("/{categoryId}")
    @PreAuthorize("hasRole('mod')")
    @Transactional
    fun deactivateCategory(@PathVariable categoryId: Int): ResponseEntity<Void> {
        val category = categoryRepository.findById(categoryId).orElse(null)
            ?: return ResponseEntity.status(404).build()
        category.isActive = false
        categoryRepository.save(category)
        return ResponseEntity.status(204).build()
    }
}

data class CategoryCreateRequest(
    @field:NotBlank val name: String,
    @JsonProperty("limit_amount") val limitAmount: Double? = null
)

data class CategoryUpdateRequest(
    val name: String? = null,
    @JsonProperty("limit_amount") val limitAmount: Double? = null,
    @JsonProperty("is_active") val isActive: Boolean? = null
)

