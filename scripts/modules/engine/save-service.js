import { Emitter } from "./emitter.js";
import * as Errors from "./errors.js";


/******************************************************************************/
/* SAVE SERVICE                                                               */
/******************************************************************************/

/*
 * Wraps the File System Access API for desktop saves and falls back to a
 * download anchor on browsers that don't expose `showSaveFilePicker`. An
 * always-on `localStorage` autosave runs as a recovery net regardless of
 * primary-save availability.
 *
 *   saved        { size, mode: "fsa" | "download" }
 *   saveFailed   SaveError
 *   autosaved    { size, at }   — fires on each successful localStorage write
 *
 * Quota concern: localStorage caps at ~5 MB per origin. `lastAutosaveSize`
 * is exposed for monitoring; QuotaExceededError is caught and re-emitted as
 * `saveFailed` so the autosave timer never crashes silently.
 */

const AUTOSAVE_KEY = "cozy-lairs.autosave";
const DEFAULT_AUTOSAVE_INTERVAL = 30000;
const SUGGESTED_FILENAME = "cozy-lair.json";
const FILE_DESCRIPTION = "Cozy Lairs save";
const FILE_MIME = "application/json";


class SaveService extends Emitter
{
    constructor({ getSnapshot, autosaveIntervalMs = DEFAULT_AUTOSAVE_INTERVAL, storage } = {})
    {
        super();

        if(typeof getSnapshot !== "function")
        {
            throw new Error("SaveService: `getSnapshot` must be a function returning a serialisable snapshot.");
        }

        this.getSnapshot = getSnapshot;
        this.autosaveIntervalMs = autosaveIntervalMs;
        this.storage = storage !== undefined ? storage : (typeof window !== "undefined" ? window.localStorage : null);

        this.handle = null;
        this.autosaveTimer = null;
        this.lastAutosaveSize = 0;
        this.lastAutosaveAt = 0;
        this.forceFailNext = false;
    }

    get hasFileHandle() { return this.handle !== null; }

    async save()
    {
        if(this.forceFailNext)
        {
            this.forceFailNext = false;
            this.emitSaveFailed("Forced save failure (debug action).", new Error("forceFailNextSave"));
            return;
        }

        let json;
        try
        {
            json = JSON.stringify(this.getSnapshot());
        }
        catch(err)
        {
            this.emitSaveFailed("Failed to serialise world snapshot.", err);
            return;
        }

        if(this.supportsFsaPicker())
        {
            await this.saveViaFsa(json);
        }
        else
        {
            this.saveViaDownload(json);
        }
    }

    forceFailNextSave()
    {
        this.forceFailNext = true;
    }

    startAutosave()
    {
        if(this.autosaveTimer !== null) { return; }
        if(!this.storage)                { return; }

        this.autosaveTimer = setInterval(() => this.writeAutosave(), this.autosaveIntervalMs);
    }

    stopAutosave()
    {
        if(this.autosaveTimer !== null)
        {
            clearInterval(this.autosaveTimer);
            this.autosaveTimer = null;
        }
    }

    loadFromAutosave()
    {
        if(!this.storage) { return null; }

        let raw;
        try
        {
            raw = this.storage.getItem(AUTOSAVE_KEY);
        }
        catch(err)
        {
            console.warn("[SaveService] Could not read autosave from storage:", err);
            return null;
        }

        if(!raw) { return null; }

        try
        {
            return JSON.parse(raw);
        }
        catch(err)
        {
            console.warn("[SaveService] Autosave entry is not valid JSON:", err);
            return null;
        }
    }

    dispose()
    {
        this.stopAutosave();
    }


    /* INTERNAL ***************************************************************/

    supportsFsaPicker()
    {
        return typeof window !== "undefined" && typeof window.showSaveFilePicker === "function";
    }

    async saveViaFsa(json)
    {
        try
        {
            if(this.handle === null)
            {
                this.handle = await window.showSaveFilePicker({
                    suggestedName: SUGGESTED_FILENAME,
                    types: [{
                        description: FILE_DESCRIPTION,
                        accept: { [FILE_MIME]: [".json"] }
                    }]
                });
            }

            const writable = await this.handle.createWritable();
            await writable.write(json);
            await writable.close();

            this.emit("saved", { size: json.length, mode: "fsa" });
        }
        catch(err)
        {
            // User-cancelled picker is an AbortError — surface as saveFailed
            // (the UI can choose to silence "AbortError" specifically).
            this.emitSaveFailed("File save failed.", err);
        }
    }

    saveViaDownload(json)
    {
        try
        {
            const blob = new Blob([json], { type: FILE_MIME });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            a.download = SUGGESTED_FILENAME;
            a.click();
            URL.revokeObjectURL(url);

            this.emit("saved", { size: json.length, mode: "download" });
        }
        catch(err)
        {
            this.emitSaveFailed("Download fallback failed.", err);
        }
    }

    writeAutosave()
    {
        let json;
        try
        {
            json = JSON.stringify(this.getSnapshot());
        }
        catch(err)
        {
            this.emitSaveFailed("Failed to serialise snapshot for autosave.", err);
            return;
        }

        try
        {
            this.storage.setItem(AUTOSAVE_KEY, json);
            this.lastAutosaveSize = json.length;
            this.lastAutosaveAt = Date.now();
            this.emit("autosaved", { size: json.length, at: this.lastAutosaveAt });
        }
        catch(err)
        {
            const isQuota = (err && (err.name === "QuotaExceededError" || err.code === 22));
            const message = isQuota
                ? `Autosave exceeded localStorage quota (${json.length.toLocaleString()} bytes). Reduce the lair size or save to a file.`
                : "Autosave write to localStorage failed.";
            this.emitSaveFailed(message, err);
        }
    }

    emitSaveFailed(message, cause)
    {
        const error = (cause instanceof Errors.SaveError)
            ? cause
            : new Errors.SaveError(message, cause ? { cause } : undefined);
        this.emit("saveFailed", error);
    }
}


export { SaveService };
