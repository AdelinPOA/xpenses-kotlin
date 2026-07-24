---
name: poa
description: Plan of Attack — automated full-stack workflow: prototype → critique → refactor → test → polish
---

# POA — Plan of Attack Workflow

Chains 5 skills in sequence for a complete feature cycle. Trigger with `/poa`.

## Workflow phases

Each phase loads the next skill, hands off context, and passes results forward.

### Phase 1: Prototype
`npx skills use "https://github.com/mattpocock/skills" --skill "prototype"`

- If the question is about UI: generate 3 radically different variants (`?variant=A|B|C`) on the relevant route
- If the question is about logic: build a terminal TUI with a pure state machine
- Output: working prototype + which variant/decision won

### Phase 2: Grill
`npx skills use "https://github.com/mattpocock/skills" --skill "grill-with-docs"`

- Critique the prototype against project best practices
- Check: framework conventions, state management, data flow, error handling
- Output: list of issues and recommended changes

### Phase 3: Improve Architecture
`npx skills use "https://github.com/mattpocock/skills" --skill "improve-codebase-architecture"`

- Refactor based on grill output
- Apply structural improvements: separation of concerns, naming, module boundaries
- Output: refactored code

### Phase 4: TDD
`npx skills use "https://github.com/mattpocock/skills" --skill "tdd"`

- Write tests for the new/modified code
- Run project test suite to verify
- Output: passing tests

### Phase 5: Polish
`npx skills use "https://github.com/anthropics/skills" --skill "frontend-design"`

- Review UI against design guidelines
- Apply frontend design polish if applicable
- Output: final polished feature

## Usage

```
/poa <description of what you want to build>
```

Example:
```
/poa add a dark mode toggle to the settings page
```
