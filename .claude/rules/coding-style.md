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
- Class fields and methods: plain `camelCase` — do NOT prefix with `_` to signal "private intent".
- Global Constants: `UPPER_SNAKE_CASE`.

Short names are acceptable when their meaning is clear from the surrounding context (e.g. `i` for loop index, `x1` to shorten `player1.positionX` for temporary calculations). Otherwise, prefer descriptive names that convey intent. Avoid abiguous abbreviations (like `vm` for "view model") that may have multiple interpretations.

The `_` prefix is decoration — it doesn't enforce anything, it just adds visual noise to every reference. The `this.` qualifier already provides scoping. If real privacy matters, escalate to a language-level mechanism (e.g. ECMAScript `#privateField`); don't reach for `_` as a halfway measure or as a habit. The same rule applies to static fields and module-level helpers (`Emitter.devSink`, not `Emitter._devSink`).

```javascript
// Avoid: pseudo-private prefix on every reference
class Emitter
{
    constructor() { this._handlers = new Map(); }
    on(event, fn) { this._handlers.set(event, fn); }
}

// Prefer: plain names; `this.` is providence enough
class Emitter
{
    constructor() { this.handlers = new Map(); }
    on(event, fn) { this.handlers.set(event, fn); }
}
```

---

## Readability & Formatting

### Structure & Spacing

- **Vertical Air:** Use Allman-style braces (opening brace on a new line) or equivalent layouts for structures and control statements to clearly delineate block boundaries.
- **Logical Paragraphs:** Group related statements (affinity grouping) into logical paragraphs separated by a blank line. Treat code like prose: when the "topic" of the logic shifts, start a new paragraph.

**Paragraph breaks are determined by ROLE, not by syntax.** A run of consecutive `let`/`const` statements is not automatically one paragraph if the variables play different roles. Common role-shifts that should always force a break:

- Reading inputs / context  →  initialising mutable state
- Initialising defaults  →  branching/computing
- Computation  →  applying to outputs (writes to `this.*`, return value, side effects)
- One self-contained "phase" of the function  →  the next phase

```javascript
// Avoid: roles run together because the syntax looks similar
positionGhostAtEdge(floorEdge)
{
    const grid = this.editor.world.grid;
    const S = grid.cellSize;
    const half = S / 2;
    let x = floorEdge.cx * S + half;
    let z = floorEdge.cz * S + half;
    let rotY = 0;
    switch(floorEdge.side)
    {
        case "south": z = floorEdge.cz * S;       rotY = 0;            break;
        case "north": z = (floorEdge.cz + 1) * S; rotY = Math.PI;      break;
        case "west":  x = floorEdge.cx * S;       rotY = Math.PI / 2;  break;
        case "east":  x = (floorEdge.cx + 1) * S; rotY = -Math.PI / 2; break;
    }
    this.ghostMesh.position.set(x, 0, z);
    this.ghostMesh.rotation.y = rotY;
    this.ghostMesh.visible = true;
}

// Prefer: one paragraph per role
positionGhostAtEdge(floorEdge)
{
    const grid = this.editor.world.grid;
    const S = grid.cellSize;
    const half = S / 2;

    let x = floorEdge.cx * S + half;
    let z = floorEdge.cz * S + half;
    let rotY = 0;

    switch(floorEdge.side)
    {
        case "south": z = floorEdge.cz * S;       rotY = 0;            break;
        case "north": z = (floorEdge.cz + 1) * S; rotY = Math.PI;      break;
        case "west":  x = floorEdge.cx * S;       rotY = Math.PI / 2;  break;
        case "east":  x = (floorEdge.cx + 1) * S; rotY = -Math.PI / 2; break;
    }

    this.ghostMesh.position.set(x, 0, z);
    this.ghostMesh.rotation.y = rotY;
    this.ghostMesh.visible = true;
}
```

**Concrete patterns that always need a blank line:**

- **Guard clauses → main work.** Any `if(...) { return; }` at the top of a function is its own phase. Add a blank line after it before the real work begins.

- **Setup state → loop/branch that consumes it.** Declaring a `Map` / `Set` / `[]` accumulator and then writing the `for` loop that fills it from a different source is two roles. Same for "build a small helper closure, then iterate."

- **Object/clone creation → property configuration → final apply.** A run of `cloned.X = …; cloned.Y = …; cloned.Z = …` is one phase (configuring the clone) and deserves a blank line *before* it (separating it from the `const cloned = …` step) **and** *after* it (separating it from the conditional / assignment that publishes the clone).

- **Compute one thing → apply it to another.** `const w = grid.cellToWorld(...)` is compute; `this.ghostMesh.position.set(...)` and `this.ghostMesh.visible = true` are apply. Blank line between them. The two `this.ghostMesh.*` lines stay together (same role: configure the ghost) — paragraphs don't fracture inside a single role.

**Tight pair exception — compute + intrinsic check.** A `const x = compute(); if(!valid(x)) { return null; }` pair is *one* phase ("get a verified x"), not two. Keep the pair adjacent with no blank inside it, but a blank before and after the pair as a unit. Same for `const x = compute(); return x;` at the end of a function.

```javascript
// Avoid: every line glued together — no role-shifts visible
positionGhostAtCell(cx, cz, yOffset = 0)
{
    if(!this.ghostMesh || !this.editor) { return; }
    const w = this.editor.world.grid.cellToWorld(cx, cz);
    this.ghostMesh.position.set(w.x, GHOST_Y + yOffset, w.z);
    this.ghostMesh.visible = true;
}

// Prefer: guard, compute, apply — three phases, two blanks
positionGhostAtCell(cx, cz, yOffset = 0)
{
    if(!this.ghostMesh || !this.editor) { return; }

    const w = this.editor.world.grid.cellToWorld(cx, cz);

    this.ghostMesh.position.set(w.x, GHOST_Y + yOffset, w.z);
    this.ghostMesh.visible = true;
}
```

```javascript
// Avoid: clone → configure → conditional → publish, all run together
if(node.isMesh && node.material)
{
    const cloned = node.material.clone();
    cloned.transparent = true;
    cloned.opacity = GHOST_OPACITY;
    cloned.depthWrite = false;
    if(cloned.color) { cloned.color.setHex(colour); }
    node.material = cloned;
}

// Prefer: each role its own paragraph
if(node.isMesh && node.material)
{
    const cloned = node.material.clone();

    cloned.transparent = true;
    cloned.opacity = GHOST_OPACITY;
    cloned.depthWrite = false;

    if(cloned.color) { cloned.color.setHex(colour); }

    node.material = cloned;
}
```

```javascript
// Avoid: declarations glued to the loop that consumes them
const owners = new Map();
const roots = [];
for(const entity of entities)
{
    roots.push(entity.object3D);
    entity.object3D.traverse(node => owners.set(node, entity));
}

// Prefer: declare-then-loop is two phases
const owners = new Map();
const roots = [];

for(const entity of entities)
{
    roots.push(entity.object3D);
    entity.object3D.traverse(node => owners.set(node, entity));
}
```

```javascript
// OK: compute + intrinsic check stays tight as one phase; whole function is several phases
screenToCell(event)
{
    if(!this.setRaycastFromEvent(event)) { return null; }

    const hit = new THREE.Vector3();
    const intersected = this.raycaster.ray.intersectPlane(FLOOR_PLANE, hit);

    if(!intersected) { return null; }

    const cell = this.grid.worldToCell(hit.x, hit.z);
    if(!this.grid.isInBounds(cell.cx, cell.cz)) { return null; }
    return cell;
}
```

Before finalising any function body of more than ~4 statements, walk it once as prose and identify the role-shifts. Each shift gets a blank line. When in doubt, lean toward a break — the cost of an extra blank line is tiny; the cost of three different phases reading as one wall of text is real.

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

### Aligned Columns

Reserve column alignment (padding spaces before `=`, `:`, etc.) for cases where the lines have *the same shape* and aligning reveals a rhythm. The reader's eye scans down the column and sees the structure repeat — that's the payoff. Without same-shape repetition, alignment is decoration: it pushes the right-hand side into a far column where the eye now has to scan further to find what the operator belongs to.

- **Reveals a Pattern:** 3+ consecutive lines, same call / same operator / same argument shape — alignment makes the rhythm visible at a glance.
- **Decoration:** Heterogeneous declarations, mixed value types, or a single outlier that needs ~10 spaces of padding to "match" — drop the alignment. Single-space separation is enough.

```javascript
// Good: same-shape lerp calls, alignment reveals the rhythm
this.theta    = THREE.MathUtils.lerp(this.theta,    this.targetTheta,    DAMPING);
this.phi      = THREE.MathUtils.lerp(this.phi,      this.targetPhi,      DAMPING);
this.distance = THREE.MathUtils.lerp(this.distance, this.targetDistance, DAMPING);

// Avoid: heterogeneous fields padded into a column for no reason
this.version           = VERSION;
this.renderer          = null;
this.cameraController  = null;
this.canvasWrapper     = null;

// Prefer: plain single-space separation
this.version = VERSION;
this.renderer = null;
this.cameraController = null;
this.canvasWrapper = null;
```

---

## Comments

A comment exists to surface a fact about the code that a reader cannot recover by reading the code itself — a quirk, an edge case, an API limitation, an invariant, a pointer to where the algorithm comes from. It is **not** a place to record the developer's reasoning about choices or architecture; that lives in the plan's Decisions register, the design document, the PR description, or git log.

The test: if you removed the comment, would a future reader be left with a question the code cannot answer on its own? If yes, keep it. If no, delete it.

### Worthwhile Comments

Things the code genuinely cannot express:

- **Non-obvious edge cases:** "Empty list short-circuits at the call site, so this branch only fires for length >= 1."
- **API quirks / 3rd-party gotchas:** "jsdom returns null without the optional `canvas` npm package."
- **Hidden invariants enforced upstream:** "Caller guarantees `cx` is in-bounds — no defensive check."
- **References for complex math or algorithms:** `// Rodrigues rotation formula — en.wikipedia.org/wiki/Rodrigues%27_rotation_formula` so a reader can look it up.
- **Workarounds for upstream bugs:** "GLTFLoader emits two `load` events on cached responses — guard with `if(this.loaded) return`."
- **Load-order / race-condition notes:** "Must run after `world.addEntity` so the entity's components are attached."

### Worthless Comments — Includes "Design Reasoning"

Comments are NOT for explaining *why the code was written this way*. Those answers belong in the plan, design, or commit history. In particular:

- **Rationale narratives** ("We chose X over Y because Z"). Decision-register territory.
- **Module / class headers** that explain what the module does. The class name and method signatures already say what; a multi-paragraph preamble is duplication.
- **Restating the function signature** ("Returns the value of X").
- **Narrating obvious code** ("Loops over each item").
- **Lead-in sentences** that summarise the very next line.
- **Lengthy exposition** of any kind.
- **Pointers to "the recent X change"** which rot fast and are already covered by commit history.
- **Justifying field defaults** ("This is null because we set it later in `start()`"). The set site is the right place if anything.

```javascript
// Avoid: explains the developer's rationale, not the code
// We chose a Map here instead of a plain object so we can use entity
// constructors as keys without coercion to strings.
this.components = new Map();

// Prefer: drop the comment. The code is self-evident.
this.components = new Map();


// Avoid: module-header narrative, restates what the class name says
/*
 * Asset manager. Loads the manifest, preloads core-tier assets at boot,
 * and resolves entity kinds to scenes on demand. ...
 */
class AssetManager { ... }

// Prefer: drop the comment block; the class name + method signatures speak.
class AssetManager { ... }


// Good: surfaces a real quirk that the code can't reveal
// Blizzard returns an empty `cstr` for single-step achievements; the
// achievement-level `description` field is the human-readable label.
function getAchievementHeader(achievementId) { ... }


// Good: pointer to algorithm reference
// Rodrigues rotation formula — rotates a vector around an axis by an angle.
function rotateAround(vector, axis, angle) { ... }
```

If you find yourself wanting to write a paragraph: stop. Either it belongs in the plan / design document, or the code itself needs to be rewritten so the comment isn't needed.


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