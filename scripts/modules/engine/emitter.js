/******************************************************************************/
/* EMITTER                                                                    */
/******************************************************************************/

// `Emitter.devSink` is a write-only instrumentation hook for the dev console
// — by design it has no subscribe API.

class Emitter
{
    static devSink = null;

    constructor()
    {
        this.handlers = new Map();
    }

    on(event, handler)
    {
        let set = this.handlers.get(event);
        if(!set)
        {
            set = new Set();
            this.handlers.set(event, set);
        }
        set.add(handler);
        
        return handler;
    }

    off(event, handler)
    {
        const set = this.handlers.get(event);
        if(set) { set.delete(handler); }
    }

    emit(event, payload)
    {
        const set = this.handlers.get(event);
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

        if(Emitter.devSink !== null)
        {
            try
            {
                Emitter.devSink(this, event, payload);
            }
            catch(err)
            {
                console.error("[Emitter] dev sink threw:", err);
            }
        }
    }
}

export { Emitter };
