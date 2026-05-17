import { Entity } from "./entity.js";

import { Transform }       from "./components/transform.js";
import { GridPlacement }   from "./components/grid-placement.js";
import { EdgePlacement }   from "./components/edge-placement.js";
import { CornerPlacement } from "./components/corner-placement.js";
import { Walker }          from "./components/walker.js";

import * as SaveCodec from "./save-codec.js";


/******************************************************************************/
/* WORLD SERIALIZER                                                           */
/******************************************************************************/

// v2 snapshot shape:
//   { v: 2,
//     kinds:      [<kind-id>, ...],
//     components: [<component-class-name>, ...],
//     entities:   [[<kindIdx>, [[<compIdx>, {data}], ...]], ...] }

const SCHEMA_VERSION = SaveCodec.SCHEMA_VERSION;

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
        if(data.walkable === true)            { options.walkable = true; }
        if(data.blocks   === true)            { options.blocks   = true; }
        if(typeof data.surfaceY === "number") { options.surfaceY = data.surfaceY; }
        if(typeof data.xOffset  === "number") { options.xOffset  = data.xOffset;  }
        if(typeof data.zOffset  === "number") { options.zOffset  = data.zOffset;  }
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
            // V5 saves stored main-cell {cx, cz}; V6+ use sub-cell {sx, sz}.
            // Drop legacy paths so the walker idles and re-plans cleanly.
            const sample = data.path[0];
            if(sample && typeof sample.sx === "number" && typeof sample.sz === "number")
            {
                walker.pendingFollow = { path: data.path, startIndex: data.pathIndex };
            }
        }
    }
};


function toJSON(world, options = {})
{
    const skipKinds = options.skipKinds ? new Set(options.skipKinds) : null;

    const kinds          = [];
    const kindIndex      = new Map();
    const components     = [];
    const componentIndex = new Map();

    const entities = [];

    for(const entity of world.entities)
    {
        if(skipKinds && skipKinds.has(entity.kind)) { continue; }

        const raw = entity.toJSON();
        const kindIdx = internIndex(raw.kind, kinds, kindIndex);

        const componentRecords = [];
        for(const name in raw.components)
        {
            const compIdx = internIndex(name, components, componentIndex);
            componentRecords.push([compIdx, encodeComponentData(name, raw.components[name])]);
        }

        entities.push([kindIdx, componentRecords]);
    }

    return { v: SCHEMA_VERSION, kinds, components, entities };
}


function fromJSONv2(world, snapshot, assets, options = {})
{
    const skipKinds = options.skipKinds ? new Set(options.skipKinds) : null;

    const result = { loaded: 0, skipped: 0, warnings: [] };

    world.clear();

    if(!snapshot || snapshot.v !== SCHEMA_VERSION || !Array.isArray(snapshot.entities))
    {
        result.warnings.push({ index: -1, reason: "Snapshot is missing or has the wrong schema version." });
        return result;
    }

    const kindList      = Array.isArray(snapshot.kinds)      ? snapshot.kinds      : [];
    const componentList = Array.isArray(snapshot.components) ? snapshot.components : [];

    for(let i = 0; i < snapshot.entities.length; i++)
    {
        const record = snapshot.entities[i];

        if(!Array.isArray(record) || record.length < 1)
        {
            result.skipped += 1;
            result.warnings.push({ index: i, reason: "Entity record is malformed." });
            continue;
        }

        const kind = kindList[record[0]];
        if(typeof kind !== "string")
        {
            result.skipped += 1;
            result.warnings.push({ index: i, reason: "Entity has an unknown kind index." });
            continue;
        }

        if(skipKinds && skipKinds.has(kind)) { continue; }

        let entity;
        try
        {
            entity = Entity.fromKind(kind, assets);
        }
        catch(err)
        {
            result.skipped += 1;
            result.warnings.push({
                index:  i,
                kind,
                reason: err && err.message ? err.message : String(err)
            });
            continue;
        }

        const componentRecords = Array.isArray(record[1]) ? record[1] : [];
        for(const cr of componentRecords)
        {
            if(!Array.isArray(cr) || cr.length < 2)
            {
                result.warnings.push({ index: i, kind, reason: "Component record is malformed." });
                continue;
            }

            const name = componentList[cr[0]];
            const rawData = cr[1];

            if(name === "Renderable") { continue; }

            if(typeof name !== "string")
            {
                result.warnings.push({ index: i, kind, reason: "Component has an unknown index." });
                continue;
            }

            const builder = COMPONENT_BUILDERS[name];
            if(!builder)
            {
                result.warnings.push({
                    index:     i,
                    kind,
                    component: name,
                    reason:    "Unknown component class."
                });
                continue;
            }

            try
            {
                builder(entity, decodeComponentData(name, rawData));
            }
            catch(err)
            {
                result.warnings.push({
                    index:     i,
                    kind,
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


/* INTERNAL *******************************************************************/

function internIndex(name, list, index)
{
    let i = index.get(name);
    if(i === undefined)
    {
        i = list.length;
        list.push(name);
        index.set(name, i);
    }
    return i;
}

function encodeComponentData(name, data)
{
    if(name === "EdgePlacement" && typeof data.side === "string")
    {
        return { ...data, side: SaveCodec.encodeSide(data.side) };
    }
    if(name === "CornerPlacement" && typeof data.corner === "string")
    {
        return { ...data, corner: SaveCodec.encodeCorner(data.corner) };
    }
    return data;
}

function decodeComponentData(name, data)
{
    if(name === "EdgePlacement" && typeof data.side === "number")
    {
        return { ...data, side: SaveCodec.decodeSide(data.side) };
    }
    if(name === "CornerPlacement" && typeof data.corner === "number")
    {
        return { ...data, corner: SaveCodec.decodeCorner(data.corner) };
    }
    return data;
}


export { toJSON, fromJSONv2, SCHEMA_VERSION };
