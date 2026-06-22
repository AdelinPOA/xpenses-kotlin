## ADDED Requirements

### Requirement: Advance, mileage, dashboard, inventory, and insurance logic are owned by services

The system SHALL extract business logic for the advance, mileage, dashboard, inventory, and insurance domains into dedicated `@Service` classes (`AdvanceService`, `MileageService`, `DashboardService`, `InventoryService`, `InsuranceService`). The corresponding controllers (`AdvanceController`, `MileageController`, `DashboardController`, `InventoryController`, `InsuranceController`) SHALL be thin: resolve the authenticated user, deserialize the request, delegate to the service, and map the response. Validation, data-scoping, persistence, and transaction boundaries SHALL live in the service layer, consistent with the existing `ReportService`/`ExpenseService` pattern.

#### Scenario: Controller delegates to service

- **WHEN** any endpoint on `AdvanceController`, `MileageController`, `DashboardController`, `InventoryController`, or `InsuranceController` is invoked
- **THEN** the controller SHALL delegate domain logic to its service and SHALL NOT call repositories directly for validation/persistence/scoping

#### Scenario: Service logic is unit-testable without web context

- **WHEN** a test instantiates one of these services with mocked repositories
- **THEN** the domain rules SHALL be verifiable without standing up a MockMvc/servlet context

#### Scenario: Shared computations are not duplicated across layers

- **WHEN** a computation such as daily-allowance is needed by both a controller/PDF path and a service
- **THEN** it SHALL be defined once in the service layer and reused, not copy-pasted across `ReportController` and `PdfService`
