## Why

The current UI is generic and lacks clear visual differentiation between user roles (Technician, Manager, Finance, Administrator). This makes the application feel less intuitive and doesn't prioritize the specific tasks each role needs to perform. A more "human-like" and role-specific experience will improve efficiency and user satisfaction.

## What Changes

- **Role-Based Visual Themes**: Introduction of distinct color palettes for each user role to provide immediate visual context.
- **Personalized Dashboard**: A redesigned dashboard featuring friendly greetings and role-specific "Action Cards" that highlight pending tasks.
- **Improved Terminology**: Navigation items and role labels will be updated to be more descriptive and user-friendly (e.g., "Approvals" -> "Review Reports").
- **Enhanced Information Hierarchy**: Better status indicators and refined layouts for expense and report lists.

## Capabilities

### New Capabilities
- `ui-personalization`: Components and logic for personalized greetings and role-based action prompts.
- `role-differentiation`: System-wide theme and label adjustments based on user role.

### Modified Capabilities
_None — existing specs are not changing at the requirement level._

## Impact

- **Frontend**: `Sidebar.tsx`, `Dashboard` page, and common UI components (`Badge`, etc.) will be updated to support role-based styling and personalized content.
- **User Experience**: Improved navigation flow and clearer prioritization of role-specific responsibilities.
