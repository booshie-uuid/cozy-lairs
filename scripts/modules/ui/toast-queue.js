/******************************************************************************/
/* TOAST QUEUE                                                                */
/******************************************************************************/

/*
 * Push transient messages onto a sink (typically a `ko.observableArray`)
 * with auto-dismiss after a fixed timeout. The sink only needs `push(item)`
 * and `remove(predicate)`; tests pass a plain stub so the queue itself
 * stays node-runnable.
 *
 * Toast shape: { id, message, level }
 *   level ∈ { "info", "warning", "error" } — drives CSS variant
 *
 * `nextId` is monotonic per instance (used as KO foreach key).
 */

const DEFAULT_DISMISS_MS = 4000;


class ToastQueue
{
    constructor(sink, { dismissMs = DEFAULT_DISMISS_MS, scheduleTimeout, cancelTimeout } = {})
    {
        if(!sink || typeof sink.push !== "function" || typeof sink.remove !== "function")
        {
            throw new Error("ToastQueue: sink must implement push() and remove()");
        }

        this.sink = sink;
        this.dismissMs = dismissMs;
        this.scheduleTimeout = scheduleTimeout || ((fn, ms) => setTimeout(fn, ms));
        this.cancelTimeout = cancelTimeout || (handle => clearTimeout(handle));

        this.nextId = 1;
        this.timers = new Map();
    }

    push(message, level = "info")
    {
        const id = this.nextId++;
        const toast = { id, message, level };
        this.sink.push(toast);

        const handle = this.scheduleTimeout(() => this.dismiss(id), this.dismissMs);
        this.timers.set(id, handle);

        return id;
    }

    dismiss(id)
    {
        const handle = this.timers.get(id);
        if(handle !== undefined)
        {
            this.cancelTimeout(handle);
            this.timers.delete(id);
        }
        this.sink.remove(t => t.id === id);
    }

    clear()
    {
        for(const handle of this.timers.values())
        {
            this.cancelTimeout(handle);
        }
        this.timers.clear();
        this.sink.remove(() => true);
    }
}


export { ToastQueue };
