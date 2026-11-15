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
- `[ChangePasswordRequest.kt:NotBlank]` — `@field:NotBlank` on `oldPassword` and `newPassword` requires non-blank values
- `[ChangePasswordRequest.kt:Size]` — `@field:Size(min = 8)` on `newPassword` requires at least 8 characters
- `[LoginRequest.kt:NotBlank]` — `@field:NotBlank` on `username` and `password` requires non-blank values

## Side Effects
- None

## Verification
- Run: `cd backend-kotlin-jpa && ./gradlew test --tests 'eu.nt.xpenses.controllers.AuthControllerTest' --no-daemon` (or `cd backend-kotlin-jpa && ./gradlew test --no-daemon` in an isolated/CI environment)
