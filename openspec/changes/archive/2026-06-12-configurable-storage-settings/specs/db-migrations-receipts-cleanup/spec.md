## MODIFIED Requirements

### Requirement: Moderator receipt scanner utility
The system SHALL provide an API and UI page accessible to users with the `mod` role to scan the active storage location (which may be local or remote via SMB, WebDAV, SFTP, or S3), identify orphaned files (files in the active storage not indexed in the `receipts` database table), and allow them to be deleted.

#### Scenario: Scanning for orphans
- **WHEN** a moderator requests a storage scan
- **THEN** the system compares the database files with files present in the active storage provider and returns a list of orphan file paths.

#### Scenario: Cleaning up orphans
- **WHEN** a moderator requests deletion of orphans
- **THEN** the system deletes the matching orphan files from the active storage provider and returns the number of cleaned files.
