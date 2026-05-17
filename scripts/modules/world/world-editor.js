import { Entity }          from "./entity.js";
import { Transform }       from "./components/transform.js";
import { GridPlacement }   from "./components/grid-placement.js";
import { EdgePlacement }   from "./components/edge-placement.js";
import { Walker }          from "./components/walker.js";
import { Animator }        from "./components/animator.js";
import { WanderBehaviour } from "./components/wander-behaviour.js";

import * as Footprint      from "./footprint.js";
import * as WalkSearch     from "./walk-search.js";
import * as Edges          from "./edges.js";

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

    canEraseFloor(cx, cz)
    {
        const grid = this.world.grid;

        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz)) { return false; }

        if(grid.getOccupant(cx, cz) === PLAYER_MARKER) { return false; }
        if(this.walkerInMainCell(cx, cz)) { return false; }

        return true;
    }

    canPlaceDecor(kind, cx, cz)
    {
        const grid = this.world.grid;

        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz)) { return false; }

        if(grid.getOccupant(cx, cz) === PLAYER_MARKER) { return false; }
        if(this.walkerInMainCell(cx, cz)) { return false; }

        const kindMeta = this.assets.getMeta(kind);
        if(kindMeta && kindMeta.placeableOnSurface)
        {
            const surface = this.findSurfaceAtCell(cx, cz);
            if(surface)
            {
                // One placeable per surface.
                return this.findSurfacePlaceablesAtCell(cx, cz).length === 0;
            }
        }

        if(grid.blockedCells.has(grid.cellKey(cx, cz))) { return false; }
        return true;
    }

    canPlaceWallDecor(_kind, edge)
    {
        if(!this.hasWallAtEdge(edge)) { return false; }
        if(this.findWallDecorAtEdge(edge)) { return false; }

        return true;
    }

    canSpawnMinion(_kind, cx, cz)
    {
        const grid = this.world.grid;
        const walkGrid = this.world.walkGrid;

        if(!grid.isInBounds(cx, cz)) { return false; }
        if(!grid.isFloor(cx, cz)) { return false; }
        if(grid.getOccupant(cx, cz) === PLAYER_MARKER) { return false; }

        // Walkers can share a main cell at different sub-cells; only the
        // spawn sub-cell (main-cell centre) needs to be clear.
        const base = walkGrid.mainToSub(cx, cz);
        const centreSx = base.sx + Math.floor(walkGrid.subsPerMain / 2);
        const centreSz = base.sz + Math.floor(walkGrid.subsPerMain / 2);

        if(!walkGrid.isWalkable(centreSx, centreSz)) { return false; }

        return true;
    }

    canNudge(entity, deltaX, deltaZ)
    {
        if(!this.isNudgeable(entity)) { return false; }
        if(!Number.isFinite(deltaX) || !Number.isFinite(deltaZ)) { return false; }

        const placement = entity.getComponent(GridPlacement);
        if(!placement.blocks) { return true; }

        const walkGrid = this.world.walkGrid;
        if(!walkGrid || !this.world.assets) { return true; }

        // Revert the entity's own stamp so the overlap check doesn't
        // collide it with itself.
        walkGrid.revertStamp(placement.stampedSubCells);

        const { subCells } = Footprint.computeFootprint({
            kind:         entity.kind,
            cx:           placement.cx,
            cz:           placement.cz,
            rotationStep: placement.rotationStep,
            xOffset:      placement.xOffset + deltaX,
            zOffset:      placement.zOffset + deltaZ,
            assets:       this.world.assets,
            walkGrid
        });

        let clear = true;
        for(const sub of subCells)
        {
            if(!walkGrid.isWalkable(sub.sx, sub.sz)) { clear = false; break; }
        }

        walkGrid.applyStamp(placement.stampedSubCells);
        return clear;
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

        if(grid.getOccupant(cx, cz) === PLAYER_MARKER)
        {
            this.toast("Can't erase floor — the player is standing here.", "warning");
            return false;
        }
        if(this.walkerInMainCell(cx, cz))
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

        // Surface-placed decor doesn't block — the surface beneath owns
        // the blocking so the cascade-on-removal path clears it once.
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

        // Removing a surface cascades to anything sitting on it —
        // drop placeables first so they go before their support.
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

    nudgeEntity(entity, deltaX, deltaZ)
    {
        if(!this.canNudge(entity, deltaX, deltaZ))
        {
            const name = entity && entity.kind ? this.displayName(entity.kind) : "this";
            this.toast(`Can't nudge ${name} — would overlap.`, "warning");
            return false;
        }

        const placement = entity.getComponent(GridPlacement);
        placement.setOffset(placement.xOffset + deltaX, placement.zOffset + deltaZ);

        return true;
    }


    /* PICKUP *****************************************************************/

    isPickupable(entity)
    {
        if(!entity || typeof entity.getComponent !== "function") { return false; }
        if(!entity.kind) { return false; }

        if(entity.kind.startsWith("floor.")) { return false; }
        if(entity.kind.startsWith("wall.stone.")) { return false; }
        if(entity.kind.startsWith("terrain.")) { return false; }

        if(entity.getComponent(GridPlacement)) { return true; }
        if(entity.getComponent(Walker)) { return true; }

        return false;
    }

    pickUpEntity(entity)
    {
        if(!this.isPickupable(entity))
        {
            const name = entity && entity.kind ? this.displayName(entity.kind) : "this";
            this.toast(`Can't pick up ${name}.`, "warning");
            return null;
        }

        const snapshot = this.snapshotEntity(entity);
        this.world.removeEntity(entity);

        return snapshot;
    }

    placeFromSnapshot(snapshot, cx, cz)
    {
        if(!snapshot) { return false; }

        if(this.isMinionKind(snapshot.kind))
        {
            return this.spawnMinion(snapshot.kind, cx, cz);
        }
        return this.placeDecor(snapshot.kind, cx, cz, 0);
    }

    restorePickup(snapshot)
    {
        if(!snapshot) { return false; }

        const grid = this.world.grid;
        const cx = snapshot.originCx;
        const cz = snapshot.originCz;

        if(!grid.isInBounds(cx, cz) || !grid.isFloor(cx, cz))
        {
            this.toast(`Lost held ${this.displayName(snapshot.kind)} — original cell is no longer available.`, "warning");
            return false;
        }

        this.displaceWalkersFromMainCell(cx, cz);

        if(this.isMinionKind(snapshot.kind))
        {
            return this.spawnMinion(snapshot.kind, cx, cz);
        }

        const blocks = (snapshot.surfaceY === 0);
        const entity = Entity.fromKind(snapshot.kind, this.assets);
        entity.addComponent(new GridPlacement(cx, cz, snapshot.rotationStep, {
            blocks,
            surfaceY: snapshot.surfaceY,
            xOffset:  snapshot.xOffset,
            zOffset:  snapshot.zOffset
        }));
        this.world.addEntity(entity);
        return true;
    }


    /* HELPERS ****************************************************************/

    buildMinionEntity(kind)
    {
        const minion = Entity.fromKind(kind, this.assets);
        // Transform before Walker so applyJSON sets object3D.position
        // before Walker reads it in onAddedToWorld.
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
        // Animator and WanderBehaviour have no toJSON, so re-attach and
        // run their onAddedToWorld manually — the entity is already
        // in the world by the time rehydration happens.
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
            catch(_err) { /* missing rig — fall back to rest pose */ }
        }

        return animations;
    }

    findFloorAtCell(cx, cz)
    {
        for(const entity of this.world.entitiesAtCell(cx, cz))
        {
            const placement = entity.getComponent(GridPlacement);
            if(placement && placement.walkable) { return entity; }
        }
        return null;
    }

    findDecorAtCell(cx, cz)
    {
        const found = [];

        for(const entity of this.world.entitiesAtCell(cx, cz))
        {
            const placement = entity.getComponent(GridPlacement);
            if(!placement) { continue; }

            // Exclude blocks and floors; decor blocks the cell or sits on a surface.
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

        for(const entity of this.world.entitiesAtCell(cx, cz))
        {
            const placement = entity.getComponent(GridPlacement);
            if(placement && placement.surfaceY > 0) { found.push(entity); }
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
        for(const entity of this.world.entitiesAtCell(cx, cz))
        {
            if(this.isBlockEntity(entity)) { return entity; }
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
        const { ncx, ncz } = Edges.neighbourCell(edge.cx, edge.cz, edge.side);
        const there = grid.isFloor(ncx, ncz);
        return here !== there;
    }

    findWallDecorAtEdge(edge)
    {
        const targetKey = Edges.edgeKey(edge.cx, edge.cz, edge.side);

        for(const entity of this.world.entities)
        {
            if(!this.isWallDecor(entity)) { continue; }

            const ep = entity.getComponent(EdgePlacement);
            if(!ep) { continue; }

            if(Edges.edgeKey(ep.cx, ep.cz, ep.side) === targetKey) { return entity; }
        }

        return null;
    }

    floorSideOfEdge(edge)
    {
        return Edges.floorSideOf(this.world.grid, edge.cx, edge.cz, edge.side);
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

    isNudgeable(entity)
    {
        if(!entity || typeof entity.getComponent !== "function") { return false; }
        if(!entity.kind) { return false; }
        if(!entity.getComponent(GridPlacement)) { return false; }

        if(entity.kind.startsWith("floor.")) { return false; }
        if(entity.kind.startsWith("wall.stone.")) { return false; }

        return true;
    }

    isBlockEntity(entity)
    {
        if(!entity || !entity.kind) { return false; }
        if(typeof entity.getComponent !== "function") { return false; }
        if(!entity.getComponent(GridPlacement)) { return false; }

        try { return this.assets.getKind(entity.kind) === "terrain.block"; }
        catch { return false; }
    }

    snapshotEntity(entity)
    {
        const placement = entity.getComponent(GridPlacement);
        if(placement)
        {
            return {
                kind:         entity.kind,
                originCx:     placement.cx,
                originCz:     placement.cz,
                rotationStep: placement.rotationStep,
                xOffset:      placement.xOffset,
                zOffset:      placement.zOffset,
                surfaceY:     placement.surfaceY
            };
        }

        const pos = entity.object3D.position;
        const cell = this.world.grid.worldToCell(pos.x, pos.z);
        return {
            kind:         entity.kind,
            originCx:     cell.cx,
            originCz:     cell.cz,
            rotationStep: 0,
            xOffset:      0,
            zOffset:      0,
            surfaceY:     0
        };
    }

    isMinionKind(kind)
    {
        try { return this.assets.getKind(kind) === "character"; }
        catch { return false; }
    }

    displaceWalkersFromMainCell(cx, cz)
    {
        const walkGrid = this.world.walkGrid;
        const grid = this.world.grid;
        const subsPerMain = walkGrid.subsPerMain;

        const isTraversable = (sx, sz) =>
        {
            if(!walkGrid.isWalkable(sx, sz)) { return false; }
            const mcx = Math.floor(sx / subsPerMain);
            const mcz = Math.floor(sz / subsPerMain);
            if(mcx === cx && mcz === cz) { return false; }
            return grid.isFloor(mcx, mcz);
        };

        for(const entity of this.world.entities)
        {
            const walker = entity.getComponent(Walker);
            if(!walker || !walker.currentSubCell) { continue; }
            const sub = walker.currentSubCell;
            if(Math.floor(sub.sx / subsPerMain) !== cx) { continue; }
            if(Math.floor(sub.sz / subsPerMain) !== cz) { continue; }

            walkGrid.revertStamp([sub]);
            const free = WalkSearch.findNearestTraversable(walkGrid, sub, isTraversable);
            walkGrid.applyStamp([sub]);

            if(free) { walker.teleportTo(free.sx, free.sz); }
        }
    }

    walkerInMainCell(cx, cz)
    {
        const subsPerMain = this.world.walkGrid.subsPerMain;

        for(const entity of this.world.entities)
        {
            const walker = entity.getComponent(Walker);
            if(!walker || !walker.currentSubCell) { continue; }

            if(Math.floor(walker.currentSubCell.sx / subsPerMain) === cx
               && Math.floor(walker.currentSubCell.sz / subsPerMain) === cz)
            {
                return entity;
            }
        }

        return null;
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

    hint(message)
    {
        if(this.viewModel && typeof this.viewModel.hint === "function")
        {
            this.viewModel.hint(message);
        }
    }
}

export { WorldEditor };
