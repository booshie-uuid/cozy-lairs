/******************************************************************************/
/* TIME FORMAT                                                                */
/******************************************************************************/

/*
 * "How long ago" formatter for the dev console events list. Anything older
 * than a minute caps at ">1m" — the ring buffer is small enough that older
 * entries are unusual, and exact ages past a minute aren't useful for live
 * debugging.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;


function formatRelative(agoMs)
{
    if(agoMs < 0)      { return "0ms"; }
    if(agoMs < SECOND) { return `${Math.round(agoMs)}ms`; }
    if(agoMs < MINUTE) { return `${(agoMs / SECOND).toFixed(1)}s`; }

    return ">1m";
}


function formatAbsolute(wallClockMs)
{
    const d = new Date(wallClockMs);
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    const ss = String(d.getSeconds()).padStart(2, "0");
    const ms = String(d.getMilliseconds()).padStart(3, "0");
    
    return `${hh}:${mm}:${ss}.${ms}`;
}


export { formatRelative, formatAbsolute };
