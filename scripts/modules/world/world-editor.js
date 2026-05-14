import { Entity }          from "./entity.js";
import { Transform }       from "./components/transform.js";
import { GridPlacement }   from "./components/grid-placement.js";
import { EdgePlacement }   from "./components/edge-placement.js";
import { Walker }          from "./components/walker.js";
import { Animator }        from "./components/animator.js";
import { WanderBehaviour } from "./components/wander-behaviour.js";

import { PLAYER_MARKER }   from "../engine/player-marker.js";


/******************************************************************************/
/* WORLD EDITOR                                                               */
/******************************************************************************/

const FLOOR_KIND = "floor.stone.basic";

const MINION_SPEED = 1.6;
const MINION_CLIPS = { idle: "Idle_A", walk: "Walking_A" };

const MINION_RIG_LIBRARIES =
[
    "animations.rig-medium.general",
    "animations.rig-medium.movement"
];

const SIDES = ["north", "south", "east", "west"];

const OPPOSITE_SIDE =
{
    north: "south",
    south: "north",
    east:  "west",
    west:  "east"
};


class WorldEditor
{
    constructor({ world, assets, viewModel = null })
    {
        this.world = world;
        this.assets = assets;
        this.viewModel = viewModel;
    }


    /* PREDICATES *************************************************************/

    canPaintFloor(cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz)) { return false; }
        if(this.cellHasBlock(cx, cz)) { return false; }
        return true;
    }

    canPlaceBlock(_kind, cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz)) { return false; }
        if(grid.isFloor(cx, cz)) { return false; }
        if(grid.blockedCells.has(grid.cellKey(cx, cz))) { return false; }
        return true;
    }

    canRemoveBlock(entity)
    {
        return this.isBlockEntity(entity);
    }

    canEraseFloor(cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz))    { return false; }

        const occupant = grid.getOccupant(cx, cz);
        if(occupant === PLAYER_MARKER) { return false; }
        if(this.isWalkerEntity(occupant)) { return false; }
        return true;
    }

    canPlaceDecor(kind, cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz))    { return false; }

        const occupant = grid.getOccupant(cx, cz);
        if(occupant === PLAYER_MARKER)    { return false; }
        if(this.isWalkerEntity(occupant)) { return false; }

        // Surface-placement branch: if the kind opts in AND a surface
        // already sits at this cell, allow the placement provided no
        // other surface-placeable is already there (V5 one-per-surface
        // rule, lifted when nudging arrives).
        const kindMeta = this.assets.getMeta(kind);
        if(kindMeta && kindMeta.placeableOnSurface)
        {
            const surface = this.findSurfaceAtCell(cx, cz);
            if(surface)
            {
                return this.findSurfacePlaceablesAtCell(cx, cz).length === 0;
            }
        }

        // Floor-placement branch: cell must not already be blocked.
        if(grid.blockedCells.has(grid.cellKey(cx, cz))) { return false; }
        return true;
    }

    canPlaceWallDecor(_kind, edge)
    {
        if(!this.hasWallAtEdge(edge))      { return false; }
        if(this.findWallDecorAtEdge(edge)) { return false; }
        return true;
    }

    canRemoveDecor(entity)
    {
        return this.isPlacedDecor(entity);
    }

    canSpawnMinion(_kind, cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz))    { return false; }
        if(grid.getOccupant(cx, cz) !== null) { return false; }
        return true;
    }

    canRemoveMinion(entity)
    {
        return this.isMinionEntity(entity);
    }


    /* ACTIONS ****************************************************************/

    paintFloor(cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz))
        {
            this.toast(`Can't paint floor — (${cx}, ${cz}) is out of bounds.`, "warning");
            return false;
        }
        if(grid.isFloor(cx, cz)) { return true; }

        const entity = Entity.fromKind(FLOOR_KIND, this.assets);
        entity.addComponent(new GridPlacement(cx, cz, 0, { walkable: true }));
        this.world.addEntity(entity);
        return true;
    }

    eraseFloor(cx, cz)
    {
        const grid = this.world.grid;
        if(!grid.isInBounds(cx, cz))
        {
            this.toast(`Can't erase floor — (${cx}, ${cz}) is out of bounds.`, "warning");
            return false;
        }
        if(!grid.isFloor(cx, cz))
        {
            this.toast(`Can't erase floor — (${cx}, ${cz}) is not a floor.`, "warning");
            return false;
        }

        const occupant = grid.getOccupant(cx, cz);
        if(occupant === PLAYER_MARKER)
        {
            this.toast("Can't erase floor — the player is standing here.", "warning");
            return false;
        }
        if(this.isWalkerEntity(occupant))
        {
            this.toast("Can't erase floor — a minion is standing here.", "warning");
            return false;
        }

        for(const decor of this.findDecorAtCell(cx, cz))
        {
            this.world.removeEntity(decor);
        }

        const floor = this.findFloorAtCell(cx, cz);
        if(floor) { this.world.removeEntity(floor); }
        return true;
    }

    placeDecor(kind, cx, cz, rotationStep = 0)
    {
        if(!this.canPlaceDecor(kind, cx, cz))
        {
            this.toast(`Can't place ${this.displayName(kind)} here.`, "warning");
            return false;
        }

        const surfaceY = this.getPlacementYFor(kind, cx, cz);

        // Floor-placed decor blocks its cell. Surface-placed decor doesn't —
        // the surface beneath it owns the blocking, so the cascade-on-surface-
        // removal path can clear blockedCells exactly once.
        const blocks = (surfaceY === 0);

        const entity = Entity.fromKind(kind, this.assets);
        entity.addComponent(new GridPlacement(cx, cz, rotationStep, { blocks, surfaceY }));
        this.world.addEntity(entity);
        return true;
    }

    placeWallDecor(kind, edge, rotationStep = 0)
    {
        if(!this.hasWallAtEdge(edge))
        {
            this.toast(`Can't place ${this.displayName(kind)} — no wall here.`, "warning");
            return false;
        }
        if(this.findWallDecorAtEdge(edge))
        {
            this.toast(`Can't place ${this.displayName(kind)} — wall already has decor.`, "warning");
            return false;
        }

        const { cx, cz, side } = this.floorSideOfEdge(edge);
        const entity = Entity.fromKind(kind, this.assets);
        entity.addComponent(new EdgePlacement(cx, cz, side));
        entity.userData = { ...(entity.userData || {}), rotationStep };
        this.world.addEntity(entity);
        return true;
    }

    removeDecor(entity)
    {
        if(!this.isPlacedDecor(entity)) { return false; }

        // Cascade: removing a surface drops anything sitting on it. Cascade
        // first so the placeables go before their support; matches the wall-
        // decor cascade pattern in WallTracer.
        const meta = this.assets.getMeta(entity.kind);
        if(meta && meta.surface)
        {
            const placement = entity.getComponent(GridPlacement);
            if(placement)
            {
                for(const placeable of this.findSurfacePlaceablesAtCell(placement.cx, placement.cz))
                {
                    this.world.removeEntity(placeable);
                }
            }
        }

        this.world.removeEntity(entity);
        return true;
    }

    spawnMinion(kind, cx, cz)
    {
        if(!this.canSpawnMinion(kind, cx, cz))
        {
            this.toast(`Can't spawn ${this.displayName(kind)} here.`, "warning");
            return false;
        }

        const minion = this.buildMinionEntity(kind);
        const spawn = this.world.grid.cellToWorld(cx, cz);
        minion.object3D.position.set(spawn.x, 0, spawn.z);
        this.world.addEntity(minion);

        const animator = minion.getComponent(Animator);
        if(animator) { animator.crossfade("idle"); }
        return true;
    }

    removeMinion(entity)
    {
        if(!this.isMinionEntity(entity)) { return false; }
        this.world.removeEntity(entity);
        return true;
    }

    placeBlock(kind, cx, cz)
    {
        if(!this.canPlaceBlock(kind, cx, cz))
        {
            this.toast(`Can't place ${this.displayName(kind)} here.`, "warning");
            return false;
        }

        const entity = Entity.fromKind(kind, this.assets);
        entity.addComponent(new GridPlacement(cx, cz, 0, { blocks: true }));
        this.world.addEntity(entity);
        return true;
    }

    removeBlock(entity)
    {
        if(!this.isBlockEntity(entity)) { return false; }
        this.world.removeEntity(entity);
        return true;
    }


    /* HELPERS ****************************************************************/

    buildMinionEntity(kind)
    {
        const minion = Entity.fromKind(kind, this.assets);
        // Transform first so it round-trips position: at load Walker reads
        // object3D.position in onAddedToWorld, which must already be set by
        // Transform.applyJSON. Component order is insertion order.
        minion.addComponent(new Transform());
        minion.addComponent(new Walker({ speed: MINION_SPEED }));

        const animations = this.collectMinionAnimations(kind);
        if(animations.length > 0)
        {
            minion.addComponent(new Animator({ clipMap: MINION_CLIPS, animations }));
        }

        minion.addComponent(new WanderBehaviour());
        return minion;
    }

    rehydrateMinion(entity)
    {
        // Walker + Transform survive a save round-trip (both have toJSON);
        // Animator and WanderBehaviour don't, so re-attach them and run
        // their onAddedToWorld manually (the entity is already in the
        // world by the time rehydration happens).
        if(!this.isMinionEntity(entity)) { return false; }

        if(!entity.hasComponent(Animator))
        {
            const animations = this.collectMinionAnimations(entity.kind);
            if(animations.length > 0)
            {
                const animator = entity.addComponent(new Animator({ clipMap: MINION_CLIPS, animations }));
                if(typeof animator.onAddedToWorld === "function")
                {
                    animator.onAddedToWorld(this.world);
                }
                animator.crossfade("idle");
            }
        }

        if(!entity.hasComponent(WanderBehaviour))
        {
            const wander = entity.addComponent(new WanderBehaviour());
            if(typeof wander.onAddedToWorld === "function")
            {
                wander.onAddedToWorld(this.world);
            }
        }

        return true;
    }

    collectMinionAnimations(kind)
    {
        const animations = [];
        const sources = [kind, ...MINION_RIG_LIBRARIES];
        for(const id of sources)
        {
            try { animations.push(...this.assets.getAnimations(id)); }
            catch(_err) { /* missing rig source — fall back to rest pose */ }
        }
        return animations;
    }

    findFloorAtCell(cx, cz)
    {
        for(const entity of this.world.entities)
        {
            const placement = entity.getComponent(GridPlacement);
            if(placement && placement.walkable && placement.cx === cx && placement.cz === cz)
            {
                return entity;
            }
        }
        return null;
    }

    findDecorAtCell(cx, cz)
    {
        const found = [];
        for(const entity of this.world.entities)
        {
            const placement = entity.getComponent(GridPlacement);
            if(!placement) { continue; }
            if(placement.cx !== cx || placement.cz !== cz) { continue; }
            // Decor is anything with a GridPlacement that either blocks
            // (floor decor + surfaces) or sits on a surface (surfaceY > 0).
            // Excludes terrain blocks and floor entities.
            if(this.isBlockEntity(entity)) { continue; }
            if(!placement.blocks && placement.surfaceY === 0) { continue; }
            found.push(entity);
        }
        return found;
    }

    findSurfaceAtCell(cx, cz)
    {
        for(const entity of this.findDecorAtCell(cx, cz))
        {
            const meta = this.assets.getMeta(entity.kind);
            if(meta && meta.surface) { return entity; }
        }
        return null;
    }

    findSurfacePlaceablesAtCell(cx, cz)
    {
        const found = [];
        for(const entity of this.world.entities)
        {
            const placement = entity.getComponent(GridPlacement);
            if(!placement) { continue; }
            if(placement.cx !== cx || placement.cz !== cz) { continue; }
            if(placement.surfaceY > 0) { found.push(entity); }
        }
        return found;
    }

    getPlacementYFor(kind, cx, cz)
    {
        const kindMeta = this.assets.getMeta(kind);
        if(!kindMeta || !kindMeta.placeableOnSurface) { return 0; }

        const surface = this.findSurfaceAtCell(cx, cz);
        if(!surface) { return 0; }

        const surfaceMeta = this.assets.getMeta(surface.kind);
        return (surfaceMeta && surfaceMeta.surface && typeof surfaceMeta.surface.surfaceY === "number")
            ? surfaceMeta.surface.surfaceY
            : 0;
    }

    findBlockAtCell(cx, cz)
    {
        for(const entity of this.world.entities)
        {
            if(!this.isBlockEntity(entity)) { continue; }
            const placement = entity.getComponent(GridPlacement);
            if(placement && placement.cx === cx && placement.cz === cz) { return entity; }
        }
        return null;
    }

    cellHasBlock(cx, cz)
    {
        return this.findBlockAtCell(cx, cz) !== null;
    }

    hasWallAtEdge(edge)
    {
        const grid = this.world.grid;
        const here = grid.isFloor(edge.cx, edge.cz);
        const { ncx, ncz } = this.neighbourCell(edge.cx, edge.cz, edge.side);
        const there = grid.isFloor(ncx, ncz);
        return here !== there;
    }

    neighbourCell(cx, cz, side)
    {
        switch(side)
        {
            case "north": return { ncx: cx,     ncz: cz + 1 };
            case "south": return { ncx: cx,     ncz: cz - 1 };
            case "east":  return { ncx: cx + 1, ncz: cz     };
            case "west":  return { ncx: cx - 1, ncz: cz     };
        }
        throw new Error(`WorldEditor.neighbourCell: invalid side "${side}".`);
    }

    findWallDecorAtEdge(edge)
    {
        const targetKey = this.canonicalEdgeKey(edge.cx, edge.cz, edge.side);
        for(const entity of this.world.entities)
        {
            if(!this.isWallDecor(entity)) { continue; }
            const ep = entity.getComponent(EdgePlacement);
            if(!ep) { continue; }
            if(this.canonicalEdgeKey(ep.cx, ep.cz, ep.side) === targetKey) { return entity; }
        }
        return null;
    }

    floorSideOfEdge(edge)
    {
        const grid = this.world.grid;
        if(grid.isFloor(edge.cx, edge.cz)) { return edge; }
        switch(edge.side)
        {
            case "north": return { cx: edge.cx,     cz: edge.cz + 1, side: "south" };
            case "south": return { cx: edge.cx,     cz: edge.cz - 1, side: "north" };
            case "east":  return { cx: edge.cx + 1, cz: edge.cz,     side: "west" };
            case "west":  return { cx: edge.cx - 1, cz: edge.cz,     side: "east" };
        }
        return edge;
    }

    canonicalEdgeKey(cx, cz, side)
    {
        switch(side)
        {
            case "north": return `${cx},${cz},north`;
            case "south": return `${cx},${cz - 1},north`;
            case "east":  return `${cx},${cz},east`;
            case "west":  return `${cx - 1},${cz},east`;
        }
        throw new Error(`WorldEditor.canonicalEdgeKey: invalid side "${side}".`);
    }

    isPlacedDecor(entity)
    {
        if(!entity || typeof entity.getComponent !== "function") { return false; }
        const gp = entity.getComponent(GridPlacement);
        if(gp && (gp.blocks || gp.surfaceY > 0)) { return true; }
        if(this.isWallDecor(entity)) { return true; }
        return false;
    }

    isWallDecor(entity)
    {
        if(!entity || !entity.kind) { return false; }
        if(!entity.getComponent(EdgePlacement)) { return false; }
        try
        {
            return this.assets.getKind(entity.kind) === "decor.wall";
        }
        catch(_err)
        {
            return false;
        }
    }

    isMinionEntity(entity)
    {
        if(!entity || typeof entity.getComponent !== "function") { return false; }
        return entity.getComponent(Walker) !== undefined;
    }

    isBlockEntity(entity)
    {
        if(!entity || !entity.kind) { return false; }
        if(typeof entity.getComponent !== "function") { return false; }
        if(!entity.getComponent(GridPlacement)) { return false; }
        try   { return this.assets.getKind(entity.kind) === "terrain.block"; }
        catch { return false; }
    }

    isWalkerEntity(occupant)
    {
        if(!occupant || occupant === PLAYER_MARKER) { return false; }
        if(typeof occupant.getComponent !== "function") { return false; }
        return occupant.getComponent(Walker) !== undefined;
    }

    displayName(kind)
    {
        try
        {
            return this.assets.getDisplayName(kind) || kind;
        }
        catch(_err)
        {
            return kind;
        }
    }

    toast(message, level)
    {
        if(this.viewModel && typeof this.viewModel.toast === "function")
        {
            this.viewModel.toast(message, level);
        }
    }
}

export { WorldEditor };
