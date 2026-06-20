# Server Rendered Initial Data

## Purpose

TBD

## Requirements

### Requirement: Dashboard and expense pages fetch initial data on the server

The system SHALL fetch the initial data for the dashboard and expense-list routes in a React Server Component on the server, using the internal API URL, before the page is sent to the browser.

#### Scenario: Initial data present in server HTML

- **WHEN** an authenticated user requests the dashboard or expenses page
- **THEN** the initial data SHALL be fetched server-side and included in the rendered response, so the page does not issue a post-mount fetch to display first content

#### Scenario: Server fetch forwards auth cookies

- **WHEN** the server component fetches data on behalf of the user
- **THEN** it SHALL forward the user's `access_token` cookie to the backend so the request is authenticated

### Requirement: Client interactivity is preserved via hydration

The system SHALL hydrate the client TanStack Query cache with the server-fetched data so that client-side refetching, mutations, and filters continue to work without a full reimplementation.

#### Scenario: No duplicate initial fetch after hydration

- **WHEN** the page hydrates on the client with server-provided data
- **THEN** TanStack Query SHALL treat the server data as the initial cache value and SHALL NOT immediately refetch the same data on mount

#### Scenario: Client mutations still function

- **WHEN** the user performs a client-side action (filter, create, edit) after hydration
- **THEN** the existing TanStack Query mutation/refetch behavior SHALL continue to operate against the cache
