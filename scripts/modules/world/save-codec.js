/******************************************************************************/
/* SAVE CODEC                                                                 */
/******************************************************************************/

/*
 * Encodes / decodes v2 snapshot objects to and from the strings stored in
 * `localStorage` (UTF-16 LZ blob) or written to file (`{ v: 2, lz: "..." }`
 * JSON wrapper around a base64 LZ blob). Pure-function module — no class,
 * no state.
 *
 * The "v2 snapshot" shape consumed and produced here is:
 *   { v: 2, kinds: [...], components: [...], entities: [...] }
 * Dictionary tables (kinds / components) and enum encoding (side / corner)
 * are owned by `world-serializer.js`; the codec just frames + (de)compresses
 * the JSON.
 *
 * `window.LZString` (UMD, vendored under libs/lz-string/) is read lazily so
 * tests can polyfill the global in beforeAll without fighting module-load
 * order.
 */

const SCHEMA_VERSION = 2;

const SIDE_NAMES   = ["south", "north", "west", "east"];
const SIDE_INDEX   = { south: 0, north: 1, west: 2, east: 3 };

const CORNER_NAMES = ["NW", "NE", "SW", "SE"];
const CORNER_INDEX = { NW: 0, NE: 1, SW: 2, SE: 3 };


function lz()
{
    if(typeof window === "undefined" || !window.LZString)
    {
        throw new Error("LZString library is not loaded.");
    }

    return window.LZString;
}


/* ENUM HELPERS ***************************************************************/

function encodeSide(name)
{
    const value = SIDE_INDEX[name];

    if(value === undefined)
    {
        throw new Error(`Unknown side name: ${name}`);
    }

    return value;
}

function decodeSide(value)
{
    const name = SIDE_NAMES[value];

    if(name === undefined)
    {
        throw new Error(`Unknown side index: ${value}`);
    }

    return name;
}

function encodeCorner(name)
{
    const value = CORNER_INDEX[name];

    if(value === undefined)
    {
        throw new Error(`Unknown corner name: ${name}`);
    }

    return value;
}

function decodeCorner(value)
{
    const name = CORNER_NAMES[value];

    if(name === undefined)
    {
        throw new Error(`Unknown corner index: ${value}`);
    }

    return name;
}


/* STORAGE PATH (localStorage UTF-16 blob) ************************************/

function encodeForStorage(snapshot)
{
    const json = JSON.stringify(snapshot);
    return lz().compressToUTF16(json);
}

function decodeForStorage(encoded)
{
    if(typeof encoded !== "string" || encoded.length === 0)
    {
        return makeError("Autosave is empty.");
    }

    let json;
    try
    {
        json = lz().decompressFromUTF16(encoded);
    }
    catch(err)
    {
        return makeError("Autosave is unreadable.", err);
    }

    if(json === null || json === undefined || json === "")
    {
        return makeError("Autosave is unreadable.");
    }

    return parseSnapshotJson(json, "Autosave");
}


/* FILE PATH (outer JSON wrapper + base64 LZ blob) ****************************/

function encodeForFile(snapshot)
{
    const innerJson = JSON.stringify(snapshot);
    const innerLz   = lz().compressToBase64(innerJson);

    return JSON.stringify({ v: SCHEMA_VERSION, lz: innerLz });
}

function decodeForFile(text)
{
    if(typeof text !== "string" || text.length === 0)
    {
        return makeError("This file isn't a Cozy Lairs save.");
    }

    let outer;
    try
    {
        outer = JSON.parse(text);
    }
    catch(err)
    {
        return makeError("This file isn't a Cozy Lairs save.", err);
    }

    if(!outer || typeof outer !== "object")
    {
        return makeError("This file isn't a Cozy Lairs save.");
    }

    if(outer.v !== SCHEMA_VERSION)
    {
        return makeError("Save format too old — please rebuild this lair in V5.");
    }

    if(typeof outer.lz !== "string" || outer.lz.length === 0)
    {
        return makeError("Save file appears to be corrupted.");
    }

    let inner;
    try
    {
        inner = lz().decompressFromBase64(outer.lz);
    }
    catch(err)
    {
        return makeError("Save file appears to be corrupted.", err);
    }

    if(inner === null || inner === undefined || inner === "")
    {
        return makeError("Save file appears to be corrupted.");
    }

    return parseSnapshotJson(inner, "Save file");
}


/* INTERNAL *******************************************************************/

function parseSnapshotJson(json, label)
{
    let snapshot;
    try
    {
        snapshot = JSON.parse(json);
    }
    catch(err)
    {
        return makeError(`${label} contains invalid data.`, err);
    }

    if(!snapshot || typeof snapshot !== "object")
    {
        return makeError(`${label} contains invalid data.`);
    }

    if(snapshot.v !== SCHEMA_VERSION)
    {
        return makeError(`${label} schema version is not ${SCHEMA_VERSION}.`);
    }

    return { snapshot, error: null };
}

function makeError(message, cause)
{
    const error = cause !== undefined ? { message, cause } : { message };
    return { snapshot: null, error };
}


export
{
    SCHEMA_VERSION,
    encodeSide, decodeSide,
    encodeCorner, decodeCorner,
    encodeForStorage, decodeForStorage,
    encodeForFile, decodeForFile
};
