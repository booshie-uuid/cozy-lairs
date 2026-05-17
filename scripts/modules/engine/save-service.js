import { Emitter } from "./emitter.js";
import * as Errors from "./errors.js";
import * as SaveCodec from "../world/save-codec.js";


/******************************************************************************/
/* SAVE SERVICE                                                               */
/******************************************************************************/

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

        let encoded;
        try
        {
            encoded = SaveCodec.encodeForFile(this.getSnapshot());
        }
        catch(err)
        {
            this.emitSaveFailed("Failed to encode world snapshot.", err);
            return;
        }

        if(this.supportsFsaPicker())
        {
            await this.saveViaFsa(encoded);
        }
        else
        {
            this.saveViaDownload(encoded);
        }
    }

    forceFailNextSave()
    {
        this.forceFailNext = true;
    }

    startAutosave()
    {
        if(this.autosaveTimer !== null) { return; }
        if(!this.storage) { return; }

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

    async openFile()
    {
        if(this.supportsFsaOpenPicker())
        {
            await this.openViaFsa();
        }
        else
        {
            await this.openViaInput();
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

        const result = SaveCodec.decodeForStorage(raw);
        if(result.error !== null)
        {
            try { this.storage.removeItem(AUTOSAVE_KEY); } catch(_) { /* best-effort */ }
            return null;
        }

        return result.snapshot;
    }

    clearAutosave()
    {
        if(!this.storage) { return; }

        try
        {
            this.storage.removeItem(AUTOSAVE_KEY);
        }
        catch(err)
        {
            console.warn("[SaveService] Could not clear autosave from storage:", err);
        }
    }

    clearFileHandle()
    {
        this.handle = null;
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

    supportsFsaOpenPicker()
    {
        return typeof window !== "undefined" && typeof window.showOpenFilePicker === "function";
    }

    async openViaFsa()
    {
        let file;
        try
        {
            const [handle] = await window.showOpenFilePicker({
                multiple: false,
                types: [{
                    description: FILE_DESCRIPTION,
                    accept: { [FILE_MIME]: [".json"] }
                }]
            });
            file = await handle.getFile();
        }
        catch(err)
        {
            if(err && err.name === "AbortError") { return; }
            this.emitLoadFailed("Couldn't open the chosen file.", err);
            return;
        }

        await this.handleOpenedFile(file);
    }

    async openViaInput()
    {
        const file = await this.promptFileViaInput();
        if(!file) { return; }

        await this.handleOpenedFile(file);
    }

    promptFileViaInput()
    {
        return new Promise(resolve =>
        {
            const input = document.createElement("input");
            input.type = "file";
            input.accept = ".json,application/json";
            input.style.position = "fixed";
            input.style.left = "-9999px";

            const cleanup = () => { if(input.parentNode) { input.parentNode.removeChild(input); } };

            input.addEventListener("change", () =>
            {
                const file = input.files && input.files[0] ? input.files[0] : null;
                cleanup();
                resolve(file);
            }, { once: true });

            // No reliable cross-browser cancel event for <input type="file">:
            // dismissing the picker fires no event, so the off-screen input
            // lingers until the next openViaInput call replaces it.
            document.body.appendChild(input);
            input.click();
        });
    }

    async handleOpenedFile(file)
    {
        const fileName = (file && file.name) ? file.name : "save.json";

        let text;
        try
        {
            text = await file.text();
        }
        catch(err)
        {
            this.emitLoadFailed("Couldn't read the chosen file.", err);
            return;
        }

        const result = SaveCodec.decodeForFile(text);
        if(result.error !== null)
        {
            this.emitLoadFailed(result.error.message, result.error.cause);
            return;
        }

        this.emit("loadRequested", { snapshot: result.snapshot, fileName });
    }

    async saveViaFsa(encoded)
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
            await writable.write(encoded);
            await writable.close();

            // ASCII payload (base64 + JSON wrapper); byte count ≈ char count.
            this.emit("saved", { size: encoded.length, mode: "fsa" });
        }
        catch(err)
        {
            // User-cancelled picker surfaces as AbortError on `cause`.
            this.emitSaveFailed("File save failed.", err);
        }
    }

    saveViaDownload(encoded)
    {
        try
        {
            const blob = new Blob([encoded], { type: FILE_MIME });
            const url = URL.createObjectURL(blob);
            const a = document.createElement("a");

            a.href = url;
            a.download = SUGGESTED_FILENAME;
            a.click();

            URL.revokeObjectURL(url);

            this.emit("saved", { size: encoded.length, mode: "download" });
        }
        catch(err)
        {
            this.emitSaveFailed("Download fallback failed.", err);
        }
    }

    writeAutosave()
    {
        let encoded;
        try
        {
            encoded = SaveCodec.encodeForStorage(this.getSnapshot());
        }
        catch(err)
        {
            this.emitSaveFailed("Failed to encode snapshot for autosave.", err);
            return;
        }

        try
        {
            this.storage.setItem(AUTOSAVE_KEY, encoded);
            // localStorage stores UTF-16 — 2 bytes per char.
            const bytes = encoded.length * 2;
            this.lastAutosaveSize = bytes;
            this.lastAutosaveAt = Date.now();
            this.emit("autosaved", { size: bytes, at: this.lastAutosaveAt });
        }
        catch(err)
        {
            const bytes = encoded.length * 2;
            const isQuota = (err && (err.name === "QuotaExceededError" || err.code === 22));
            const message = isQuota
                ? `Autosave exceeded localStorage quota (${bytes.toLocaleString()} bytes). Reduce the lair size or save to a file.`
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

    emitLoadFailed(message, cause)
    {
        const error = (cause instanceof Errors.SaveError)
            ? cause
            : new Errors.SaveError(message, cause ? { cause } : undefined);

        this.emit("loadFailed", error);
    }
}


export { SaveService };
