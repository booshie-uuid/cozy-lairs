/******************************************************************************/
/* EMITTER                                                                    */
/******************************************************************************/

/*
 * Direct subscriber base class — events are past-tense facts emitted from
 * the producer, never commands. Each subclass documents its event vocabulary
 * next to its definition.
 *
 * `Emitter._devSink` is a write-only instrumentation hook for the dev
 * console. Gameplay code cannot subscribe via this channel — it has no
 * subscribe API by design.
 */

class Emitter
{
    static _devSink = null;

    constructor()
    {
        this._handlers = new Map();
    }

    on(event, handler)
    {
        let set = this._handlers.get(event);
        if(!set)
        {
            set = new Set();
            this._handlers.set(event, set);
        }
        set.add(handler);
        return handler;
    }

    off(event, handler)
    {
        const set = this._handlers.get(event);
        if(set) { set.delete(handler); }
    }

    emit(event, payload)
    {
        const set = this._handlers.get(event);
        if(set)
        {
            for(const handler of set)
            {
                try
                {
                    handler(payload);
                }
                catch(err)
                {
                    console.error(`[Emitter] handler for "${event}" threw:`, err);
                }
            }
        }

        if(Emitter._devSink !== null)
        {
            try
            {
                Emitter._devSink(this, event, payload);
            }
            catch(err)
            {
                console.error("[Emitter] dev sink threw:", err);
            }
        }
    }
}

export { Emitter };
