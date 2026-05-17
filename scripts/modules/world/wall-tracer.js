import { Entity }          from "./entity.js";
import { GridPlacement }   from "./components/grid-placement.js";
import { EdgePlacement }   from "./components/edge-placement.js";
import { CornerPlacement } from "./components/corner-placement.js";

import * as Edges from "./edges.js";


/******************************************************************************/
/* WALL TRACER                                                                */
/******************************************************************************/

const WALL_STRAIGHT_KIND = "wall.stone.straight";
const WALL_HALF_KIND = "wall.stone.half";
const CORNER_KIND = "wall.stone.corner";

const HALF_OFFSET = 1;
const HALF_WALL_ORIGIN_OFFSET = -1;

const CORNER_ORIENTATION =
{
    "north,west": "SE",
    "north,east": "SW",
    "south,west": "NE",
    "south,east": "NW"
};


class WallTracer
{
    constructor({ world, assets })
    {
        this.world = world;
        this.assets = assets;
        this.walls = new Map();
        this.corners = new Map();

        this.entityChangedHandler = entity => this.onEntityChanged(entity);
        this.world.on("entityAdded", this.entityChangedHandler);
        this.world.on("entityRemoved", this.entityChangedHandler);
    }

    dispose()
    {
        this.world.off("entityAdded", this.entityChangedHandler);
        this.world.off("entityRemoved", this.entityChangedHandler);

        this.walls.clear();
        this.corners.clear();
    }

    getWallEntities()
    {
        const all = [];

        for(const entities of this.walls.values())
        {
            for(const entity of entities) { all.push(entity); }
        }

        return all;
    }

    getCornerEntities()
    {
        return [...this.corners.values()];
    }


    /* EVENT HANDLER **********************************************************/

    onEntityChanged(entity)
    {
        const placement = entity.getComponent(GridPlacement);
        if(!placement || !placement.walkable) { return; }

        this.retraceRegion(placement.cx, placement.cz);
    }


    /* RETRACE ****************************************************************/

    retraceRegion(cx, cz)
    {
        // Retrace corners before walls — wall geometry reads corner state.
        for(let dx = 0; dx <= 1; dx++)
        {
            for(let dz = 0; dz <= 1; dz++)
            {
                this.retraceCorner(cx + dx, cz + dz);
            }
        }

        for(let dx = -1; dx <= 1; dx++)
        {
            for(let dz = -1; dz <= 1; dz++)
            {
                this.retraceCellWalls(cx + dx, cz + dz);
            }
        }
    }


    /* CORNERS ****************************************************************/

    retraceCorner(vx, vz)
    {
        const key = this.vertexKey(vx, vz);
        const orientation = this.cornerOrientationAtVertex(vx, vz);
        const existing = this.corners.get(key);

        if(orientation === null)
        {
            if(existing)
            {
                this.world.removeEntity(existing);
                this.corners.delete(key);
            }
            return;
        }

        if(existing)
        {
            const cp = existing.getComponent(CornerPlacement);
            if(cp && cp.corner === orientation) { return; }
            this.world.removeEntity(existing);
        }

        const corner = Entity.fromKind(CORNER_KIND, this.assets);
        corner.addComponent(new CornerPlacement(vx, vz, orientation));
        this.world.addEntity(corner);
        this.corners.set(key, corner);
    }

    cornerOrientationAtVertex(vx, vz)
    {
        const hasN = this.edgeHasWall(vx - 1, vz,     "east");
        const hasS = this.edgeHasWall(vx - 1, vz - 1, "east");
        const hasE = this.edgeHasWall(vx,     vz - 1, "north");
        const hasW = this.edgeHasWall(vx - 1, vz - 1, "north");

        const total = (hasN ? 1 : 0) + (hasS ? 1 : 0) + (hasE ? 1 : 0) + (hasW ? 1 : 0);
        if(total !== 2) { return null; }
        if(!((hasN || hasS) && (hasE || hasW))) { return null; }

        const verticalSide = hasN ? "north" : "south";
        const horizontalSide = hasE ? "east" : "west";
        return CORNER_ORIENTATION[`${verticalSide},${horizontalSide}`];
    }


    /* WALLS ******************************************************************/

    retraceCellWalls(cx, cz)
    {
        for(const side of Edges.SIDES)
        {
            this.retraceWallAt(cx, cz, side);
        }
    }

    retraceWallAt(cx, cz, side)
    {
        const key = Edges.edgeKey(cx, cz, side);
        const shouldExist = this.edgeHasWall(cx, cz, side);

        const existing = this.walls.get(key);
        if(existing)
        {
            for(const entity of existing) { this.world.removeEntity(entity); }
            this.walls.delete(key);
        }

        if(!shouldExist)
        {
            this.cascadeRemoveWallDecorAt(key);
            return;
        }

        const placement = Edges.floorSideOf(this.world.grid, cx, cz, side);
        const cornerLow = this.corners.has(this.vertexKey(...Edges.endpointLow(placement.cx, placement.cz, placement.side)));
        const cornerHigh = this.corners.has(this.vertexKey(...Edges.endpointHigh(placement.cx, placement.cz, placement.side)));

        const entities = this.buildWallEntities(placement.cx, placement.cz, placement.side, cornerLow, cornerHigh);
        for(const entity of entities) { this.world.addEntity(entity); }
        this.walls.set(key, entities);
    }

    buildWallEntities(cx, cz, side, cornerLow, cornerHigh)
    {
        if(!cornerLow && !cornerHigh)
        {
            return [this.buildWall(WALL_STRAIGHT_KIND, cx, cz, side, 0, 0)];
        }
        if(cornerLow && !cornerHigh)
        {
            return [this.buildWall(WALL_HALF_KIND, cx, cz, side, +HALF_OFFSET, HALF_WALL_ORIGIN_OFFSET)];
        }
        if(!cornerLow && cornerHigh)
        {
            return [this.buildWall(WALL_HALF_KIND, cx, cz, side, -HALF_OFFSET, HALF_WALL_ORIGIN_OFFSET)];
        }
        return [];
    }

    buildWall(kind, cx, cz, side, lengthOffset, originOffset)
    {
        const wall = Entity.fromKind(kind, this.assets);
        wall.addComponent(new EdgePlacement(cx, cz, side, lengthOffset, originOffset));
        return wall;
    }


    /* HELPERS ****************************************************************/

    cascadeRemoveWallDecorAt(targetEdgeKey)
    {
        const toRemove = [];

        for(const entity of this.world.entities)
        {
            if(!this.isWallDecorEntity(entity)) { continue; }

            const ep = entity.getComponent(EdgePlacement);
            if(Edges.edgeKey(ep.cx, ep.cz, ep.side) === targetEdgeKey) { toRemove.push(entity); }
        }

        for(const entity of toRemove) { this.world.removeEntity(entity); }
    }

    isWallDecorEntity(entity)
    {
        if(!entity || !entity.kind) { return false; }
        if(typeof entity.getComponent !== "function") { return false; }
        if(!entity.getComponent(EdgePlacement)) { return false; }
        try { return this.assets.getKind(entity.kind) === "decor.wall"; }
        catch { return false; }
    }

    edgeHasWall(cx, cz, side)
    {
        const here = this.world.grid.isFloor(cx, cz);
        const { ncx, ncz } = Edges.neighbourCell(cx, cz, side);
        const there = this.world.grid.isFloor(ncx, ncz);
        return here !== there;
    }

    vertexKey(vx, vz)
    {
        return `${vx},${vz}`;
    }
}

export { WallTracer };
