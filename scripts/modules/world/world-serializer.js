import { Entity } from "./entity.js";

import { Transform }       from "./components/transform.js";
import { GridPlacement }   from "./components/grid-placement.js";
import { EdgePlacement }   from "./components/edge-placement.js";
import { CornerPlacement } from "./components/corner-placement.js";
import { Walker }          from "./components/walker.js";


/******************************************************************************/
/* WORLD SERIALIZER                                                           */
/******************************************************************************/

/*
 * Plain-object snapshot of the world's entities for save/load.
 *
 *   { version: 1, entities: [{ kind, components: { Name: {...}, ... } }] }
 *
 * Renderable is auto-added by Entity.fromKind, so its entries in a snapshot
 * are skipped on load. Unknown kinds and unknown component classes are
 * collected into the result's `warnings` array, never thrown — the lair
 * loads minus the orphans.
 */

const SCHEMA_VERSION = 1;

const COMPONENT_BUILDERS =
{
    Transform: (entity, data) =>
    {
        const transform = entity.addComponent(new Transform());
        transform.applyJSON(data);
    },

    GridPlacement: (entity, data) =>
    {
        const options = {};
        if(data.walkable === true) { options.walkable = true; }
        if(data.blocks   === true) { options.blocks   = true; }
        entity.addComponent(new GridPlacement(data.cx, data.cz, data.rotationStep, options));
    },

    EdgePlacement: (entity, data) =>
    {
        entity.addComponent(new EdgePlacement(data.cx, data.cz, data.side, data.lengthOffset, data.originOffset));
    },

    CornerPlacement: (entity, data) =>
    {
        entity.addComponent(new CornerPlacement(data.vx, data.vz, data.corner));
    },

    Walker: (entity, data) =>
    {
        const walker = entity.addComponent(new Walker({ speed: data.speed }));
        if(Array.isArray(data.path) && data.path.length > 0)
        {
            walker.pendingFollow = { path: data.path, startIndex: data.pathIndex };
        }
    }
};


function toJSON(world)
{
    const entities = [];
    for(const entity of world.entities)
    {
        entities.push(entity.toJSON());
    }
    return { version: SCHEMA_VERSION, entities };
}


function fromJSON(world, snapshot, assets)
{
    const result = { loaded: 0, skipped: 0, warnings: [] };

    const existing = Array.from(world.entities);
    for(const entity of existing)
    {
        world.removeEntity(entity);
    }

    if(!snapshot || !Array.isArray(snapshot.entities))
    {
        result.warnings.push({ index: -1, reason: "Snapshot is missing or has no entities array." });
        return result;
    }

    for(let i = 0; i < snapshot.entities.length; i++)
    {
        const record = snapshot.entities[i];

        if(!record || typeof record.kind !== "string")
        {
            result.skipped += 1;
            result.warnings.push({ index: i, reason: "Entity record is missing a string `kind`." });
            continue;
        }

        let entity;
        try
        {
            entity = Entity.fromKind(record.kind, assets);
        }
        catch(err)
        {
            result.skipped += 1;
            result.warnings.push({
                index:  i,
                kind:   record.kind,
                reason: err && err.message ? err.message : String(err)
            });
            continue;
        }

        const components = record.components || {};
        for(const name in components)
        {
            if(name === "Renderable") { continue; }

            const builder = COMPONENT_BUILDERS[name];
            if(!builder)
            {
                result.warnings.push({
                    index:     i,
                    kind:      record.kind,
                    component: name,
                    reason:    "Unknown component class."
                });
                continue;
            }

            try
            {
                builder(entity, components[name]);
            }
            catch(err)
            {
                result.warnings.push({
                    index:     i,
                    kind:      record.kind,
                    component: name,
                    reason:    err && err.message ? err.message : String(err)
                });
            }
        }

        world.addEntity(entity);
        result.loaded += 1;
    }

    return result;
}


export { toJSON, fromJSON, SCHEMA_VERSION };
