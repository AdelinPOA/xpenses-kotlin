# Async Receipt Ocr

## Purpose

TBD

## Requirements

### Requirement: Receipt OCR is processed asynchronously

The system SHALL process receipt OCR off the request thread. The scan endpoint SHALL accept the uploaded receipt, enqueue OCR work on a bounded executor, and return promptly without blocking a Tomcat worker thread for the duration of the OCR parse.

#### Scenario: Scan request returns immediately

- **WHEN** a client submits a receipt to the scan endpoint
- **THEN** the endpoint SHALL return `202 Accepted` with a job identifier (and/or status URL) without waiting for OCR to complete

#### Scenario: OCR runs on a bounded executor

- **WHEN** OCR work is enqueued
- **THEN** it SHALL execute on a dedicated bounded thread pool distinct from the Tomcat HTTP worker pool, so HTTP request capacity is unaffected by OCR latency

#### Scenario: Pool saturation does not exhaust HTTP threads

- **WHEN** more OCR jobs are submitted than the executor can run concurrently
- **THEN** excess jobs SHALL queue (or be rejected with a defined backpressure response) without consuming additional Tomcat HTTP threads

### Requirement: OCR job status is retrievable

The system SHALL expose the status and eventual result of an OCR job via a status endpoint keyed by the job identifier.

#### Scenario: Poll pending job

- **WHEN** a client polls the status endpoint for a job still being processed
- **THEN** the response SHALL indicate a `processing` state

#### Scenario: Poll completed job

- **WHEN** OCR completes successfully
- **THEN** the status endpoint SHALL return a `completed` state with the parsed OCR result

#### Scenario: Poll failed job

- **WHEN** OCR fails (sidecar/provider error)
- **THEN** the status endpoint SHALL return a `failed` state with an error indication, and the failure SHALL be logged
