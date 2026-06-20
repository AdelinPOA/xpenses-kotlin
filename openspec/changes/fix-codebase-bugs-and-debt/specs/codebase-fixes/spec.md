## ADDED Requirements

### Requirement: Structured WebP Validation
The system SHALL validate that WebP uploads have a valid RIFF container and WEBP sub-signature.

#### Scenario: Validate WebP image
- **WHEN** a file with a .webp extension is uploaded
- **THEN** the system verifies bytes 0-3 equal "RIFF" and bytes 8-11 equal "WEBP"

### Requirement: Database-Level Export Filtering
The system SHALL perform all query filtering on the database level when exporting expenses.

#### Scenario: Filtered export
- **WHEN** a user requests an export with filters
- **THEN** the database executes the query and returns only the matching records

### Requirement: Spring-Managed Background Migration
The storage migration background tasks SHALL be executed within a Spring-managed task executor.

#### Scenario: Safe migration
- **WHEN** storage migration is triggered
- **THEN** the task executor manages the thread pool lifecycle
