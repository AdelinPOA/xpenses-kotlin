## ADDED Requirements

### Requirement: Uploaded filenames are sanitized before storage

The system SHALL strip directory components from a client-supplied filename before constructing a storage path, so that an upload cannot write outside its intended per-user directory. The stored relative path SHALL be derived from `File(originalName).name` (basename only); path separators, `..` segments, and absolute-path prefixes SHALL NOT survive into the storage key.

#### Scenario: Traversal payload in upload filename is neutralized

- **WHEN** a user uploads an insurance document whose `originalFilename` is `../../etc/passwd` (or contains `/` / `\`)
- **THEN** the system SHALL store it using only the sanitized basename within the user's designated directory and SHALL NOT write outside that directory

### Requirement: Served file paths are confined to their designated directory

The system SHALL validate that the resolved absolute path of any file read for download (e.g. signatures, receipts) lies within its designated base directory before opening it. A stored path that resolves outside the base directory SHALL be refused.

#### Scenario: Out-of-bounds stored path is refused

- **WHEN** a signature/receipt record holds a path that, once resolved, escapes the designated base directory
- **THEN** the system SHALL refuse to serve the file (HTTP `400`/`404`) rather than reading an arbitrary filesystem location

#### Scenario: Legitimate in-bounds file is served

- **WHEN** the resolved path is inside the designated base directory
- **THEN** the system SHALL serve the file normally
