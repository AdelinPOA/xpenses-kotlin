# Auth DTOs

## Overview
Request payload data transfer objects for user authentication and password change operations in `eu.nt.xpenses.dto.auth`.

## Interface
- `[ChangePasswordRequest.kt:ChangePasswordRequest]` — `data class ChangePasswordRequest(oldPassword: String, newPassword: String)`
- `[ChangePasswordRequest.kt:oldPassword]` — `val oldPassword: String` mapped via `@JsonProperty("old_password")`
- `[ChangePasswordRequest.kt:newPassword]` — `val newPassword: String` mapped via `@JsonProperty("new_password")`
- `[LoginRequest.kt:LoginRequest]` — `data class LoginRequest(username: String, password: String)`
- `[LoginRequest.kt:username]` — `val username: String`
- `[LoginRequest.kt:password]` — `val password: String`

## Invariants
- `[ChangePasswordRequest.kt:oldPassword]` — `@field:NotBlank` requires a non-blank value and `@field:Size(max = 72)` caps length at 72 characters
- `[ChangePasswordRequest.kt:newPassword]` — `@field:NotBlank` requires a non-blank value and `@field:Size(min = 8)` / `@field:Size(max = 72)` enforce length between 8 and 72 characters
- `[LoginRequest.kt:username]` — `@field:NotBlank` requires a non-blank value
- `[LoginRequest.kt:password]` — `@field:NotBlank` requires a non-blank value and `@field:Size(max = 72)` caps length at 72 characters

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.AuthControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
