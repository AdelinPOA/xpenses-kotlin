# admin-forms-validation-toasts Specification

## Purpose
TBD - created by archiving change admin-forms-validation-toasts. Update Purpose after archive.
## Requirements
### Requirement: Settings Form Validation with Schemas
The settings forms (LDAP, SMTP, IMAP) SHALL validate all inputs (e.g., hostnames, emails, ports, DNs) client-side against a Zod schema before form submission.

#### Scenario: Submitting invalid port in SMTP settings
- **WHEN** user types "999999" into the SMTP Port field and clicks Save
- **THEN** the form prevents submission and displays "Port must be between 1 and 65535" below the Port field

### Requirement: Global Toast Alert Messages
The frontend SHALL display non-intrusive floating toast notifications in the top-right or bottom-right corner when save or test operations complete, replacing localized page-shifting alert containers.

#### Scenario: Save connection settings successfully
- **WHEN** user submits valid IMAP configuration and save operation completes
- **THEN** a green success toast pops up displaying "IMAP Settings saved successfully"
