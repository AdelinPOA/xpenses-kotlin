# User DTOs

## Overview
Request and response data transfer objects for user creation, profile updates, role/activation management, and user projection in `eu.nt.xpenses.dto.user`.

## Interface
- `[ActiveUpdateRequest.kt:ActiveUpdateRequest]` — `data class ActiveUpdateRequest(@JsonProperty("is_active") @field:NotNull val isActive: Boolean? = null)`
- `[RoleUpdateRequest.kt:RoleUpdateRequest]` — `data class RoleUpdateRequest(@field:NotBlank val role: String)`
- `[UserCreateRequest.kt:UserCreateRequest]` — `data class UserCreateRequest(username: String, displayName: String, password: String, role: String, email: String? = null)`
- `[UserResponse.kt:UserResponse]` — `data class UserResponse(id: Int, username: String, displayName: String, email: String?, role: String, isActive: Boolean, authSource: String, hasSignature: Boolean, notificationsEnabled: Boolean, language: String)`
- `[UserResponse.kt:fromUser]` — `fun fromUser(user: User): UserResponse` mapping a `User` entity and deriving `hasSignature` from `!user.signaturePath.isNullOrEmpty()`
- `[UserUpdateMeRequest.kt:UserUpdateMeRequest]` — `data class UserUpdateMeRequest(displayName: String? = null, notificationsEnabled: Boolean? = null, language: String? = null)`

## Invariants
- `[ActiveUpdateRequest.kt:NotNull]` — `isActive` must not be `null`
- `[RoleUpdateRequest.kt:NotBlank]` — `role` must not be blank
- `[UserCreateRequest.kt:NotBlank]` — `username`, `displayName`, and `password` must not be blank
- `[UserCreateRequest.kt:Size]` — `password` must be between 8 and 72 characters (`Size(min = 8)`, `Size(max = 72)`)
- `[UserCreateRequest.kt:Pattern]` — `role` must match `technician|manager|chef_finance|mod`
- `[UserResponse.kt:fromUser]` — `user.id` must be non-null (throws `IllegalStateException("User must be persisted")`)
- `[UserUpdateMeRequest.kt:Size]` — `displayName` must have minimum length 1 when provided

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.UserControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
