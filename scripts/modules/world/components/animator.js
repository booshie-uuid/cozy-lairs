import * as THREE from "three";


/******************************************************************************/
/* ANIMATOR                                                                   */
/******************************************************************************/

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

// KayKit rig clips include tracks for optional nodes (`handslotr` /
// `handslotl` weapon slots) that not every character mesh has. Without
// filtering, THREE.PropertyBinding warns "No target node found for
// track: ..." on every mount. Track-list clones are cheap — keyframe
// data isn't duplicated.
function filterClipForRoot(clip, root)
{
    // Test stubs may pass minimal `{ name }` objects with no tracks.
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
