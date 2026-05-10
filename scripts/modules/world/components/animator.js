import * as THREE from "three";


/******************************************************************************/
/* ANIMATOR                                                                   */
/******************************************************************************/

/*
 * Wraps a `THREE.AnimationMixer` and a state→clip map. `crossfade("walk")`
 * fades the named state in and the previous state out. Missing clips warn at
 * construction (when the bundle's animations don't contain the configured
 * name) and at crossfade time (when the requested state isn't in `actions`)
 * — never throw, since animation gaps shouldn't crash the demo.
 *
 * The constructor takes the bundle's `animations` array directly rather than
 * an `AssetManager` reference: keeps the component honest about exactly which
 * clips it knows about and decouples it from asset lifecycle.
 *
 * `mixerFactory` is injectable so tests can substitute a stub mixer; default
 * builds a real `THREE.AnimationMixer` rooted at the entity's Object3D.
 */

const DEFAULT_FADE_MS = 200;


class Animator
{
    constructor({ clipMap, animations, mixerFactory } = {})
    {
        if(!clipMap || typeof clipMap !== "object")
        {
            throw new Error("Animator: `clipMap` is required (state → clip-name map).");
        }
        if(!Array.isArray(animations))
        {
            throw new Error("Animator: `animations` must be an array of AnimationClip.");
        }

        this.clipMap = { ...clipMap };
        this.animations = animations;
        this.mixerFactory = mixerFactory || ((root) => new THREE.AnimationMixer(root));
        this.mixer = null;
        this.actions = {};
        this.currentAction = null;
        this.currentState = null;
        this.entity = null;
    }

    attach(entity)
    {
        this.entity = entity;
    }

    onAddedToWorld(_world)
    {
        this.mixer = this.mixerFactory(this.entity.object3D);
        const root = this.entity.object3D;

        const available = this.animations.map(c => c.name);
        for(const [state, clipName] of Object.entries(this.clipMap))
        {
            const clip = this.animations.find(c => c.name === clipName);
            if(!clip)
            {
                console.warn(
                    `[Animator] No clip named "${clipName}" for state "${state}" on "${this.entity.kind}". ` +
                    `Available clips: ${available.length ? available.join(", ") : "<none>"}`
                );
                continue;
            }
            const usable = filterClipForRoot(clip, root);
            this.actions[state] = this.mixer.clipAction(usable);
        }
    }

    crossfade(state, durationMs = DEFAULT_FADE_MS)
    {
        if(state === this.currentState) { return; }

        const next = this.actions[state];
        if(!next)
        {
            console.warn(
                `[Animator] No action for state "${state}". States configured: ` +
                `${Object.keys(this.actions).join(", ") || "<none>"}`
            );
            return;
        }

        const duration = durationMs / 1000;
        next.reset().fadeIn(duration).play();

        if(this.currentAction && this.currentAction !== next)
        {
            this.currentAction.fadeOut(duration);
        }

        this.currentAction = next;
        this.currentState = state;
    }

    update(dt)
    {
        if(this.mixer) { this.mixer.update(dt); }
    }
}


/******************************************************************************/
/* CLIP TRACK FILTERING                                                       */
/******************************************************************************/

/*
 * Animation clips from KayKit's rig libraries include tracks for nodes
 * that not every character mesh has — most notably `handslotr` /
 * `handslotl` (weapon-attachment slots present on the Skeleton_Minion
 * but not on the Mannequin). When `mixer.clipAction(clip)` binds those
 * tracks, `THREE.PropertyBinding` warns ("No target node found for
 * track: ...") on every load.
 *
 * To suppress the noise without touching the underlying clips (they're
 * shared across all entities of the same rig), we make a lightweight
 * per-mount copy of the clip with the unbindable tracks removed. Cheap
 * — clones don't dupe the keyframe data, just the track list.
 */

function filterClipForRoot(clip, root)
{
    // Defensive — test stubs may pass minimal `{ name }` objects with
    // no tracks. Real KayKit clips always have a `tracks` array.
    if(!Array.isArray(clip.tracks)) { return clip; }

    const usable = clip.tracks.filter(track =>
    {
        const parsed = THREE.PropertyBinding.parseTrackName(track.name);
        return THREE.PropertyBinding.findNode(root, parsed.nodeName) !== null;
    });
    if(usable.length === clip.tracks.length) { return clip; }
    return new THREE.AnimationClip(clip.name, clip.duration, usable);
}


export { Animator };
