import { test, expect } from "vitest";
import { formatRelative, formatAbsolute } from "../../../scripts/modules/engine/dev/time-format.js";


test("sub-second ages show as integer ms", () =>
{
    expect(formatRelative(0)).toBe("0ms");
    expect(formatRelative(234)).toBe("234ms");
    expect(formatRelative(999)).toBe("999ms");
});


test("1s..60s ages show as fractional seconds with one decimal", () =>
{
    expect(formatRelative(1000)).toBe("1.0s");
    expect(formatRelative(1500)).toBe("1.5s");
    expect(formatRelative(12345)).toBe("12.3s");
    expect(formatRelative(59999)).toBe("60.0s");
});


test("60s and beyond cap at >1m", () =>
{
    expect(formatRelative(60000)).toBe(">1m");
    expect(formatRelative(120000)).toBe(">1m");
    expect(formatRelative(3600000)).toBe(">1m");
});


test("negative diffs (clock skew) clamp to 0ms", () =>
{
    expect(formatRelative(-500)).toBe("0ms");
});


test("ms values are rounded, not truncated", () =>
{
    expect(formatRelative(234.7)).toBe("235ms");
    expect(formatRelative(234.4)).toBe("234ms");
});


/* ABSOLUTE *******************************************************************/

test("formatAbsolute renders HH:MM:SS.mmm in local time, zero-padded", () =>
{
    // Build a Date at a known local time and feed its ms through formatAbsolute.
    const d = new Date();
    d.setHours(9, 5, 7, 42);
    expect(formatAbsolute(d.getTime())).toBe("09:05:07.042");

    d.setHours(23, 59, 59, 999);
    expect(formatAbsolute(d.getTime())).toBe("23:59:59.999");
});
