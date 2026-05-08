---
name: execute-plan
description: You MUST use this when executing a plan created by the Create Plan skill. Ensures the plan is followed, progress is tracked, and decisions are recorded.
user-invocable: true
---

# Execute Plan

Produces an actionable, task-oriented, step-by-step plan to implement the user request. The plan must be saved to the working directory so it can be referenced, executed, and updated with a record of progress and implementation decisions, ensuring any deviations made during execution are captured alongside the original intent.

## When to Use

Trigger this skill when the user asks you to execute or continue with a plan created by the Create Plan skill. Typical phrasings:

- "Execute the plan ..."
- "Continue with the plan ..."
- "Follow the plan ..."
- "Implement the plan ..."
- "Carry on with the plan ..."
- "Resume the plan ..."

Do NOT trigger for:

- Pure questions where no implementation work follows
- Requests for opinions or advice only
- Cases where the user has not already created a plan using the Create Plan skill

## Workflow

Follow these steps in order. Do not skip ahead.

Do NOT begin executing the plan unless the user explicitly asks for you to execute the plan.

### 1. Understand the request

Read the request carefully. If anything is ambiguous (scope, target environment, success criteria, hard constraints), ask clarifying questions before drafting the plan. ALWAYS make use of the `AskUserQuestion` tool unless it is unavailable; otherwise ask inline. A vague plan is worse than no plan — do not guess at unclear requirements.

### 2. Location of the plan

You MUST only execute the current plan, which you can determine by checking `./project/project.md` in the working directory. This ensures that you are always working from the most up-to-date plan and that progress and decisions are recorded in a single source of truth. Do NOT execute any plan that does not match the location specified in `./project/project.md`, even if the user provides the content of the plan in the request or references a different file path. If no valid plan is specified, inform the user that no plan is available to execute.

### 3. Execute the plan

- Understand any existing progress by reading through the plan, noting any steps already marked as completed (`- [*]`) and any decisions already recorded.
- Execute the plan task by task, step by step, following the sequence established by original plan as closely as possible.
- ALWAYS stop after each task to check in with the user before proceeding to the next task. This ensures alignment and allows the user to make adjustments or reprioritize as needed. Carry any feedback into the next task, being sure to record any important or impactful decisions that the user has made.
- As you execute, tick steps in place by changing `- [ ]` to `- [*]` as each step is completed. Do not make any other modifications to the step. Do not delete or reorder steps.
- Record any key or impactful choice made during execution — particularly deviations from the original Steps — by appending to that Task's Decisions section using the format:
  `- <decision>: <rationale>`
- Record any significant deviations from the original plan that don't fit in the Decisions section in the plan-level deviations section with a clear explanation.
- Record any new bugs, issues, or tasks that arise during execution that are outside the scope of the original plan in the plan-level issues and adjustments section or follow up section with a clear explanation.
- NEVER modify the original details of the plan (task titles, objectives, expected outcomes, risks, original steps) — only tick steps and append decisions.
  - If you identify new risks, bugs, or issues that need to be addressed, record them in the "Bugs / Issues" section towards the end of the plan.
  - If you identify follow up tasks or potential improvements that are outside the scope of the original plan, record them in the "Follow Up" section at the end of the plan.

### 4. Confirm completion of tasks

ALWAYS check in with the user after completing each task. NEVER automatically proceed to the next task without explicit confirmation from the user. This ensures alignment and allows the user to make adjustments or reprioritize as needed. Carry any feedback into the next task, being sure to record any important or impactful decisions that the user has made.

When the user confirms completion of a task, increment the task component of the version number in `./project/project.md` by 1. For example, if the current version is V0.1.0 and Task 1 is completed, update the version to V0.2.0. Also update the version number in any relevant configurations.
