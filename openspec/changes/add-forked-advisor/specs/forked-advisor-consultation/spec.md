## ADDED Requirements

### Requirement: Advisor consults through a forked child session
The advisor tool SHALL run consultations through a forked child advisory session instead of an in-process LLM side-call.

#### Scenario: Executor invokes advisor
- **WHEN** the executor calls the advisor tool
- **THEN** the package starts a forked child advisory run for the configured advisor model

### Requirement: Forked advisor inherits parent branch context
The forked advisor child SHALL inherit the parent session branch context so it can reason from the same effective conversation state.

#### Scenario: Parent session has relevant prior context
- **WHEN** the executor invokes advisor after a multi-turn session
- **THEN** the advisor child can inspect the inherited parent branch context during its advisory run

### Requirement: Advisor returns advisory guidance only
The advisor child SHALL return concise advisory output that tells the parent executor what to do next, limited to plan, correction, or stop guidance.

#### Scenario: Advisor completes successfully
- **WHEN** the advisor child finishes without error
- **THEN** the parent receives advisory guidance rather than direct user-facing task execution

### Requirement: Advisor child cannot recurse through advisor
The advisor package SHALL prevent advisor child sessions from invoking the advisor tool again.

#### Scenario: Advisor child session starts
- **WHEN** the forked advisor child is created
- **THEN** the advisor tool is unavailable within that child advisory session

### Requirement: Advisor surfaces consultation failures clearly
The advisor package SHALL return a structured failure result when advisor consultation cannot be performed.

#### Scenario: Advisor child cannot be started or completed
- **WHEN** the advisor consultation fails because configuration, startup, or execution does not succeed
- **THEN** the parent receives an advisor error result that explains the failure
