## ADDED Requirements

### Requirement: User can draw and save a signature
The system SHALL provide a canvas-based signature pad where authenticated users can draw their signature with mouse or touch input. The drawn signature SHALL be saved as a PNG image associated with the user's account.

#### Scenario: First-time signature recording
- **WHEN** user navigates to profile/signature settings and draws a signature on the canvas
- **THEN** the system saves the signature PNG to the server and stores the path on the user record

#### Scenario: Signature canvas interaction
- **WHEN** user draws on the signature canvas
- **THEN** the canvas captures strokes in real-time with smooth line rendering

#### Scenario: Clear canvas before saving
- **WHEN** user clicks "Clear" while drawing
- **THEN** the canvas is reset to blank, allowing a fresh drawing

### Requirement: User can view their saved signature
The system SHALL display the user's current saved signature image on their profile page. If no signature exists, the system SHALL show the empty signature pad.

#### Scenario: View existing signature
- **WHEN** user has a saved signature and visits profile/signature settings
- **THEN** the current signature image is displayed alongside the canvas for re-recording

#### Scenario: No signature saved
- **WHEN** user has no saved signature and visits profile/signature settings
- **THEN** the empty signature pad is shown with a prompt to draw

### Requirement: User can re-record their signature
The system SHALL allow users to overwrite their existing signature by drawing a new one. The previous signature file SHALL be replaced.

#### Scenario: Overwrite existing signature
- **WHEN** user draws a new signature and saves it
- **THEN** the old signature file is replaced with the new one

### Requirement: User can delete their signature
The system SHALL allow users to delete their saved signature. This removes the file and clears the path from the user record.

#### Scenario: Delete signature
- **WHEN** user clicks "Delete signature"
- **THEN** the signature file is removed and the user record's signature_path is set to NULL

### Requirement: Signature API endpoints
The system SHALL expose three endpoints at `/api/users/me/signature`:
- `GET` — returns the signature PNG image (200) or 404 if none saved
- `PUT` — accepts PNG image data, saves/overwrites the signature file, returns 200
- `DELETE` — removes the signature file and clears the user record, returns 204

#### Scenario: GET signature when exists
- **WHEN** authenticated user calls GET `/api/users/me/signature` and has a saved signature
- **THEN** the system returns the PNG image with `Content-Type: image/png`

#### Scenario: GET signature when none exists
- **WHEN** authenticated user calls GET `/api/users/me/signature` and has no saved signature
- **THEN** the system returns 404

#### Scenario: PUT signature
- **WHEN** authenticated user sends PNG data to PUT `/api/users/me/signature`
- **THEN** the system saves the file to `/app/data/signatures/{user_id}.png` and updates `users.signature_path`

#### Scenario: DELETE signature
- **WHEN** authenticated user calls DELETE `/api/users/me/signature`
- **THEN** the system removes the file and sets `users.signature_path` to NULL
