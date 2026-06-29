## MODIFIED Requirements

### Requirement: OCR job status is retrievable

The system SHALL expose the status and eventual result of an OCR job via a status endpoint keyed by the job identifier.

#### Scenario: Poll pending job

- **WHEN** a client polls the status endpoint for a job still being processed
- **THEN** the response SHALL indicate a `processing` state

#### Scenario: Poll completed job

- **WHEN** OCR completes successfully
- **THEN** the status endpoint SHALL return a `completed` state with the parsed OCR result

#### Scenario: Poll failed job

- **WHEN** OCR fails (all Gemini model tiers in the fallback chain exhausted)
- **THEN** the status endpoint SHALL return a `failed` state with an error indication, and the failure SHALL be logged
