/******************************************************************************/
/* WALKER                                                                     */
/******************************************************************************/

/*
 * Moves the entity along a fixed list of world-space waypoints, ping-ponging
 * at the endpoints. Faces the direction of travel via Y rotation. No
 * animations — the model slides without playing a walk cycle (the Animator
 * component lands later).
 */

const FACING_OFFSET = 0;
const ARRIVE_EPSILON = 0.001;


class Walker
{
    constructor(waypoints, speed = 1.5)
    {
        if(!Array.isArray(waypoints) || waypoints.length < 2)
        {
            throw new Error("Walker: requires at least 2 waypoints.");
        }
        this.waypoints = waypoints.map((wp, i) =>
        {
            if(!wp || typeof wp.x !== "number" || typeof wp.z !== "number")
            {
                throw new Error(`Walker: waypoint[${i}] must have numeric x and z (got ${JSON.stringify(wp)}).`);
            }
            return { x: wp.x, z: wp.z };
        });
        this.speed       = speed;
        this.targetIndex = 1;
        this.direction   = 1;
        this.entity      = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(_world)
    {
        const start = this.waypoints[0];
        this.entity.object3D.position.set(start.x, 0, start.z);
        this._faceTowards(this.waypoints[this.targetIndex]);
    }

    update(dt)
    {
        const o      = this.entity.object3D;
        const target = this.waypoints[this.targetIndex];

        const dx   = target.x - o.position.x;
        const dz   = target.z - o.position.z;
        const dist = Math.sqrt(dx * dx + dz * dz);

        const step = this.speed * dt;

        if(step >= dist)
        {
            o.position.x = target.x;
            o.position.z = target.z;
            this._advance();
            this._faceTowards(this.waypoints[this.targetIndex]);
            return;
        }

        o.position.x += (dx / dist) * step;
        o.position.z += (dz / dist) * step;

        if(dist > ARRIVE_EPSILON)
        {
            o.rotation.y = Math.atan2(dx, dz) + FACING_OFFSET;
        }
    }

    toJSON()
    {
        return {
            waypoints: this.waypoints,
            speed:     this.speed
        };
    }


    /* INTERNAL ***************************************************************/

    _advance()
    {
        const next = this.targetIndex + this.direction;
        if(next >= this.waypoints.length || next < 0)
        {
            this.direction *= -1;
        }
        this.targetIndex += this.direction;
    }

    _faceTowards(target)
    {
        const o  = this.entity.object3D;
        const dx = target.x - o.position.x;
        const dz = target.z - o.position.z;
        if(dx * dx + dz * dz > ARRIVE_EPSILON * ARRIVE_EPSILON)
        {
            o.rotation.y = Math.atan2(dx, dz) + FACING_OFFSET;
        }
    }
}

export { Walker };
