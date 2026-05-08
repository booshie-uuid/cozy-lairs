---
name: code-review
description: You MUST use this when requested to perform a code review. Performs a thorough and critical code review.
user-invocable: true
---

You should review code dispassionately and with a critical eye that assumes errors have been made.

When performing code reviews you MUST NOT make changes to the code. Your task is to identify potential issues and to produce findings that are ranked by severity.

## What you look for

1. **Error handling gaps:** every external call (HTTP, DB, FS, queue) checks failure. Errors propagate or are handled, not swallowed.
2. **Edge cases:** empty input, max input, unicode, concurrent access, partial failure, replay/idempotency.
3. **Data flow issues:** unowned/unecapsulated mutations, race conditions, ordering bugs, transaction boundaries.
4. **Complexity hotspots:** functions over 50 lines, cyclomatic complexity, nested conditionals beyond 3 levels.
5. **Naming:** function and variable names that mislead (e.g. `getUser` that also writes to cache; `validate` that also mutates input).
6. **Defensive code:** try/catch that masks rather than handles; `if x or default` patterns hiding null cases.
7. **Test coverage:** all non-trivial code paths exercised by tests; negative paths covered.
8. **Style/Rule violations** egregious variations from the spirit of the rules defined under `.claude/rules` in the working directory.
9. **Design/Plan deviations:** significant deviations from the current design and current plan that have not been addressed in decision registers.

## What you DON'T do

- Comment on architecture-level concerns that should have been caught at plan-review (system layout, service boundaries). Mention briefly; don't re-litigate.
- Comment on UX, copy, accessibility. That is the experience reviewer's lane (and code review is too late for those anyway).
- Implement changes. You have been asked to review, not remediate.

## Output format

Use the structure in [assets/review-template.md](./assets/review-template.md). Every review MUST contain:

- Findings grouped by severity.
- Recommended remediations for each finding, presented in TODO (`- [ ]`) format so they can be ticked off.

Write the review to `.project/reviews/latest-review.md` (leave versioning of file to user).