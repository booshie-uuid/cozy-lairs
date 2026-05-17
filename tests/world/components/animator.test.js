import { test, expect, vi } from "vitest";
import * as THREE from "three";

import { World }    from "../../../scripts/modules/world/world.js";
import { Grid }     from "../../../scripts/modules/world/grid.js";
import { Entity }   from "../../../scripts/modules/world/entity.js";
import { Animator } from "../../../scripts/modules/world/components/animator.js";


function makeStubMixer()
{
    const actionsByClip = new Map();

    const mixer =
    {
        updateCalls: [],
        actionsByClip,

        update(dt)
        {
            this.updateCalls.push(dt);
        },

        clipAction(clip)
        {
            if(actionsByClip.has(clip)) { return actionsByClip.get(clip); }
            const action =
            {
                clip,
                fadeInCalls:  [],
                fadeOutCalls: [],
                resetCalls:   0,
                playCalls:    0,
                fadeIn(d)  { this.fadeInCalls.push(d);  return this; },
                fadeOut(d) { this.fadeOutCalls.push(d); return this; },
                reset()    { this.resetCalls += 1;       return this; },
                play()     { this.playCalls  += 1;       return this; }
            };
            actionsByClip.set(clip, action);
            return action;
        }
    };

    return mixer;
}


function makeAnimator(clipMap, animations)
{
    const mixer = makeStubMixer();
    const animator = new Animator({
        clipMap,
        animations,
        mixerFactory: () => mixer
    });

    const world = new World(new Grid(4, 4, 4));
    const entity = new Entity("character.test", new THREE.Object3D());
    entity.addComponent(animator);
    world.addEntity(entity);

    return { animator, mixer, entity };
}


test("clip-map construction — creates an action for each configured state", () =>
{
    const animations =
    [
        { name: "Idle" },
        { name: "Walking_A" },
        { name: "Attack" }
    ];
    const { animator, mixer } = makeAnimator({ idle: "Idle", walk: "Walking_A" }, animations);

    expect(Object.keys(animator.actions).sort()).toEqual(["idle", "walk"]);
    expect(animator.actions.idle.clip).toBe(animations[0]);
    expect(animator.actions.walk.clip).toBe(animations[1]);
    expect(mixer.actionsByClip.size).toBe(2);
});


test("missing clip name warns and skips the action without throwing", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { animator } = makeAnimator(
        { idle: "Idle", walk: "DoesNotExist" },
        [{ name: "Idle" }]
    );

    expect(animator.actions.idle).toBeDefined();
    expect(animator.actions.walk).toBeUndefined();
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("DoesNotExist"));

    consoleWarnSpy.mockRestore();
});


test("crossfade fades the new state in and the previous state out", () =>
{
    const { animator } = makeAnimator(
        { idle: "Idle", walk: "Walk" },
        [{ name: "Idle" }, { name: "Walk" }]
    );

    animator.crossfade("walk", 200);

    expect(animator.actions.walk.resetCalls).toBe(1);
    expect(animator.actions.walk.fadeInCalls).toEqual([0.2]);
    expect(animator.actions.walk.playCalls).toBe(1);
    expect(animator.actions.idle.fadeOutCalls).toEqual([]);
    expect(animator.currentState).toBe("walk");

    animator.crossfade("idle", 100);

    expect(animator.actions.walk.fadeOutCalls).toEqual([0.1]);
    expect(animator.actions.idle.resetCalls).toBe(1);
    expect(animator.actions.idle.fadeInCalls).toEqual([0.1]);
    expect(animator.currentState).toBe("idle");
});


test("crossfade to the current state is a no-op", () =>
{
    const { animator } = makeAnimator(
        { idle: "Idle" },
        [{ name: "Idle" }]
    );

    animator.crossfade("idle");
    const firstReset = animator.actions.idle.resetCalls;

    animator.crossfade("idle");
    expect(animator.actions.idle.resetCalls).toBe(firstReset);
});


test("crossfade to an unknown state warns and stays on the current state", () =>
{
    const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { animator } = makeAnimator(
        { idle: "Idle" },
        [{ name: "Idle" }]
    );
    animator.crossfade("idle");

    animator.crossfade("dance");
    expect(animator.currentState).toBe("idle");
    expect(consoleWarnSpy).toHaveBeenCalledWith(expect.stringContaining("dance"));

    consoleWarnSpy.mockRestore();
});


test("update advances the mixer with the supplied dt", () =>
{
    const { animator, mixer, entity } = makeAnimator(
        { idle: "Idle" },
        [{ name: "Idle" }]
    );

    entity.update(0.016);
    entity.update(0.033);

    expect(mixer.updateCalls).toEqual([0.016, 0.033]);
});


/* CLIP TRACK FILTERING ********************************************************/

function makeAnimatorWithRoot(clipMap, animations, root)
{
    const mixer = makeStubMixer();
    const animator = new Animator({
        clipMap,
        animations,
        mixerFactory: () => mixer
    });

    const world = new World(new Grid(4, 4, 4));
    const entity = new Entity("character.test", root);
    entity.addComponent(animator);
    world.addEntity(entity);

    return { animator, mixer, entity };
}


test("filterClipForRoot — clip whose tracks all bind is passed through unchanged", () =>
{
    const root = new THREE.Object3D();
    const bone = new THREE.Object3D();
    bone.name = "bone";
    root.add(bone);

    const track = new THREE.VectorKeyframeTrack("bone.position", [0, 1], [0, 0, 0, 1, 0, 0]);
    const clip = new THREE.AnimationClip("Walk", 1, [track]);

    const { animator } = makeAnimatorWithRoot(
        { walk: "Walk" },
        [clip],
        root
    );

    // Original clip identity preserved when no tracks needed filtering.
    expect(animator.actions.walk.clip).toBe(clip);
    expect(animator.actions.walk.clip.tracks).toHaveLength(1);
});


test("filterClipForRoot — clip with unbindable tracks returns a clone with only resolvable tracks", () =>
{
    const root = new THREE.Object3D();
    const bone = new THREE.Object3D();
    bone.name = "bone";
    root.add(bone);
    // Note: NO `handslotr` child — that track should get filtered out.

    const validTrack = new THREE.VectorKeyframeTrack("bone.position", [0, 1], [0, 0, 0, 1, 0, 0]);
    const invalidTrack = new THREE.VectorKeyframeTrack("handslotr.position", [0, 1], [0, 0, 0, 1, 0, 0]);
    const clip = new THREE.AnimationClip("Walk", 1, [validTrack, invalidTrack]);

    const { animator } = makeAnimatorWithRoot(
        { walk: "Walk" },
        [clip],
        root
    );

    const usedClip = animator.actions.walk.clip;
    expect(usedClip).not.toBe(clip);                  // new clip, not original
    expect(usedClip.name).toBe("Walk");               // name preserved
    expect(usedClip.duration).toBe(clip.duration);    // duration preserved
    expect(usedClip.tracks).toHaveLength(1);          // invalid track stripped
    expect(usedClip.tracks[0].name).toBe("bone.position");
});


test("filterClipForRoot — clip with no resolvable tracks yields an empty-tracks clone (no throw)", () =>
{
    const root = new THREE.Object3D();
    // No named children — every track should be filtered out.

    const track = new THREE.VectorKeyframeTrack("missing_bone.position", [0, 1], [0, 0, 0, 1, 0, 0]);
    const clip = new THREE.AnimationClip("Walk", 1, [track]);

    const { animator } = makeAnimatorWithRoot(
        { walk: "Walk" },
        [clip],
        root
    );

    const usedClip = animator.actions.walk.clip;
    expect(usedClip).not.toBe(clip);
    expect(usedClip.tracks).toHaveLength(0);
});


test("filterClipForRoot — stub clip without a tracks array passes through unchanged (defensive)", () =>
{
    // The default test stubs use `{ name: "Idle" }` with no tracks — the
    // filter's early Array.isArray guard keeps these compatible.
    const stub = { name: "Idle" };
    const { animator } = makeAnimatorWithRoot(
        { idle: "Idle" },
        [stub],
        new THREE.Object3D()
    );
    expect(animator.actions.idle.clip).toBe(stub);
});
