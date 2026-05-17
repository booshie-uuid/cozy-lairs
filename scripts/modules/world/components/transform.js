/******************************************************************************/
/* TRANSFORM                                                                  */
/******************************************************************************/

// Rotation is stored as Euler [x, y, z] radians; the Three.js default
// "XYZ" order is assumed and not persisted.

class Transform
{
    constructor()
    {
        this.entity = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    get position() { return this.entity.object3D.position; }
    get rotation() { return this.entity.object3D.rotation; }
    get scale()    { return this.entity.object3D.scale; }

    toJSON()
    {
        const o = this.entity.object3D;
        return {
            position: o.position.toArray(),
            rotation: [o.rotation.x, o.rotation.y, o.rotation.z],
            scale:    o.scale.toArray()
        };
    }

    applyJSON(json)
    {
        const o = this.entity.object3D;
        if(json.position) { o.position.fromArray(json.position); }
        if(json.rotation) { o.rotation.set(json.rotation[0], json.rotation[1], json.rotation[2]); }
        if(json.scale)    { o.scale.fromArray(json.scale); }
    }
}

export { Transform };
