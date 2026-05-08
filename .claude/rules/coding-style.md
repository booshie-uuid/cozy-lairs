# Coding Style

> This file is extended by language-specific rules in `rules/<language>/coding-style.md`.

---

## Encapsulated Mutation (CRITICAL)

Only an object should be allowed to modify its own internal state. External logic must call methods (e.g. `player.damage(10)`) rather than modifying properties directly (`player.hp -= 10`).

---

## Core Principles

### KISS (Keep It Simple)

- Prefer the simplest solution that actually works.
- Avoid premature optimization.
- Optimize for clarity over cleverness.

### DRY (Don't Repeat Yourself)

- Extract repeated logic into shared functions or utilities.
- Avoid copy-paste implementation drift.
- Introduce abstractions when repetition is real, not speculative.

### YAGNI (You Aren't Gonna Need It)

- Do not build features or abstractions before they are needed.
- Avoid speculative generality.
- Start simple, then refactor when the pressure is real.

---

## File Organization

MANY SMALL FILES > FEW LARGE FILES:
- High cohesion, low coupling.
- 200-400 lines typical, 800 max.
- Extract utilities from large modules.
- Organize by feature/domain, not by type.

---

## Error Handling and Validation

### Error Handling

ALWAYS handle errors comprehensively:
- Handle errors explicitly at every level.
- Provide user-friendly error messages in UI-facing code.
- Never silently swallow errors.

### Input/Data Validation

ALWAYS validate at system boundaries:
- Validate all user input before processing.
- Fail fast with clear error messages.
- Never trust external data (API responses, user input, file content).

---

## Naming Conventions

- Variables and functions: `camelCase` with descriptive names.
- Booleans: prefer `is`, `has`, `should`, or `can` prefixes.
- Classes, types, and components: `PascalCase`.
- Global Constants: `UPPER_SNAKE_CASE`.

Short names are acceptable when their meaning is clear from the surrounding context (e.g. `i` for loop index, `x1` to shorten `player1.positionX` for temporary calculations). Otherwise, prefer descriptive names that convey intent. Avoid abiguous abbreviations (like `vm` for "view model") that may have multiple interpretations.

---

## Readability & Formatting

### Structure & Spacing

- **Vertical Air:** Use Allman-style braces (opening brace on a new line) or equivalent layouts for structures and control statements to clearly delineate block boundaries.
- **Logical Paragraphs:** Group related statements (affinity grouping) in to logical paragraphs seperated by a blank line. Treat code like prose: when the "topic" of the logic shifts, start a new paragraph.

### The "Sensible" Line Rule

The priority is code that is readable and maintainable. So apply common sense when it comes to things like closures or simple "short-circuit" logic.

- **Clarity Over Density:** Avoid "clever" one-liners or complex closures.
- **One-Line Allowance:** Simple guards (e.g. `if(condition) { return; }`) or trivial transformations are acceptable on one line ONLY if they remain immediately scannable.
- **Complexity Threshold:** If a logic block contains complex conditions or multiple statements, it must be expanded to multiple lines.

### Anonymous Functions & Closures

- **No "Logic Golfing"**: Do not use shorthand function syntax (like arrow functions) to compress complex logic into a single line.
- **Implicit vs. Explicit**: Only use implicit returns for trivial, single-operation mappings. If the function requires a conditional or multiple steps, use an explicit block with braces.

### Intentional Spacing

- **Declarations:** Separate variable initialization from the logic that consumes them, unless the logic is a direct, immediate refinement of that specific variable.
- **Linear Flow:** Favor vertical space over horizontal density. If you have to squint or scroll horizontally to understand a line, it is too complex.

---

## Comments

Comments exist to add information that isn't obvious from the code itself. The code shows *what*, comments should explain *why* (a constraint, a quirk, a non-obvious decision). But you should only feel the need to explain *why* if it is not obvious from the code.

A comment is only worth keeping if removing it would leave a future reader with a question they can't answer by reading the code alone. Any comment that can be removed without confuse anyone should be deleted.

### Worthwhile Comments

- Concise inline comments.
- Non-obvious design decisions (why X over Y).
- Contracts the code can't enforce on its own.
- External context (a 3rd party event firing twice, a race condition, a load order dependency).

### Worthless Comments

- Lengthy exposition.
- Restating the function signature ("Returns the value of X").
- Narrating obvious code ("Loops over each item").
- Lead-in sentences that summarise the very next line.
- Pointers to "the recent X change" which rot fast and are already covered by the commit history.

```javascript
// Avoid: restates what the table name and contents already convey
// All texture asset paths used by the addon. Centralised so a future
// skin override is a one-line change.
const UI_TEXTURES = { ... }

// Prefer: drop the comment entirely
const UI_TEXTURES = { ... }

// Good: external context that isn't visible from the code
// blizzard returns an empty `cstr` for single-step achievements; the
// achievement-level `description` field is the human-readable label.
function getAchievementHeader(achievementId) { ... }
```


### Structural Comments

Comments should also be used to help break up large files and keep them easy to navigate.

- Section headers should be a three line banner padded to exactly 80 columns. There should be two blank lines above the banner and one blank line below it before the first declaration in the section.
- Sub-Section headers should be a single line banners padded to exactly 80 columns. There should only be a single blank link about to banner.
- Header text should be capitalised and concise.

```javascript


/******************************************************************************/
/* SECTION                                                                    */
/******************************************************************************/

function firstThingInSection()

/* SUB-SECTION ****************************************************************/

function firstThingInSubSection()
```

---

## Code Smells to Avoid

### Deep Nesting

Prefer early returns over nested conditionals once the logic starts stacking.

### Magic Numbers

Use named constants for meaningful thresholds, delays, and limits.

### Long Functions

Split large functions into focused pieces with clear responsibilities.

## Code Quality Checklist

Before marking work complete:
- [ ] Code is readable and well-named.
- [ ] Comments add value and explain "why", not "what".
- [ ] Functions are small (<50 lines).
- [ ] Files are focused (<800 lines).
- [ ] No deep nesting (>4 levels).
- [ ] Proper error handling.
- [ ] No hardcoded values (use constants or config).
- [ ] No direct mutation (use encapsulated methods).