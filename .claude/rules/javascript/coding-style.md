---
paths:
  - "**/*.js"
  - "**/*.jsx"
---
# JavaScript Coding Style

> This file extends [common/coding-style.md](../coding-style.md) with JavaScript specific content.

## Logic & Encapsulation

### Encapsulation (Classes)

Use ES6 Classes for stateful entities and complex logical grouping.

- **Encapsulated Mutation**: Only a class should be allowed to modify its own internal state. External logic must call methods (e.g. `player.damage(10)`) rather than modifying properties directly (`player.hp -= 10`).
- **Internal Decomposition**: Use classes to break complex tasks into internal methods, maintaining a clean public API without overloading functions.

### State Change Notification (Events/Signals)

To prevent other components from getting "confused" when state changes, classes should emit events to signal important changes.

- **Emit Changes**: Classes must "emit" events when a change in state may require an external reaction (e.g. updating UI, playing a sound).
- **Subscription Based**: Rather than creating a noisy global event bus, other components should subscribe to change events they are interested in.

Basic Event Emitter:
```javascript
class EventEmitter
{
  constructor()
  {
    this.events = {};
  }

  on(name, fn)
  {
    (this.events[name] = this.events[name] || []).push(fn);
  }

  emit(name, ...args)
  {
    if(!this.events[name]) { return; }
    
    this.events[name].forEach(fn => fn(...args));
  }

  off(name, fn)
  {
    if (!this.events[name]) { return; }

    this.events[name] = this.events[name].filter(f => f !== fn);
  }
}
```

Example Usage:
```javascript
// Emitter:
class Player extends EventEmitter
{
  constructor()
  {
    super();
    this.hp = 100;
  }

  damage(amount)
  {
    this.hp -= amount;
    this.emit('damage', amount, this.hp);
  }
}

// Listener:
player.on('collision', (other, force, pos) =>{ 
  /* logic */ 
});
```

### Stateless Utilities (Modules)

Use Module Exports only for "pure" stateless helpers to avoid unnecessary Singletons.

- **Statelessness**: Only use module exports for pure functions that do not maintain internal state or complex interactions.
- **Strict Namespacing**: Use `import * as Namespace` exclusively. Direct named imports (e.g., `{ func }`) are prohibited.

```javascript
import * as Utils from "./utils.js";

Utils.format(data); // clear provenance
```

## Error Handling

Use async/await with try-catch and narrow unknown errors safely:

```javascript
async function loadUser(userId)
{
  try
  {
    const result = await riskyOperation(userId)

    return result

  }
  catch (error: unknown)
  {
    logger.error('Operation failed', error)
    
    throw new Error(getErrorMessage(error))
  }
}
```

## Logging

- Wrap logging in a production-safe wrapper that can be disabled or redirected as needed.
- Use `console.error` for unrecoverable errors and `console.warn` for recoverable issues.
- No `console.log` statements in production deployments.