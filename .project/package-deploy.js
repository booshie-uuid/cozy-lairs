#!/usr/bin/env node
import { rmSync, mkdirSync, cpSync, statSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";


/******************************************************************************/
/* PATHS                                                                      */
/******************************************************************************/

const HERE   = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(HERE, "..");
const OUTPUT = resolve(HERE, "deploy");


/******************************************************************************/
/* DEPLOY MANIFEST                                                            */
/******************************************************************************/

/*
 * Exactly the files the static webserver needs to serve. Anything not listed
 * here (node_modules, tests, .claude, .project itself, package*.json,
 * vitest.config.js, .git, IDE folders) is excluded by virtue of not being
 * named.
 *
 * Each entry is a path relative to the project root. Directories are copied
 * recursively. Files are copied 1:1.
 */

const FILES = ["index.html"];

const DIRECTORIES =
[
    "assets",   // manifest.json + KayKit GLTFs / GLBs / textures
    "libs",     // three, lz-string, knockout (vendored UMD + ESM)
    "scripts",  // app.js + every modules/ file (no build step; sources are runtime)
    "styles"    // main.css, cozy.css, fonts/ (woff2s + SOURCE.md for OFL attribution)
];


/******************************************************************************/
/* COPY                                                                       */
/******************************************************************************/

function ensureExists(path)
{
    if(!existsSync(path))
    {
        throw new Error(`Deploy manifest references missing path: ${relative(ROOT, path)}`);
    }
}

function wipeOutput()
{
    if(existsSync(OUTPUT)) { rmSync(OUTPUT, { recursive: true, force: true }); }
    mkdirSync(OUTPUT, { recursive: true });
}

function copyFile(src, dst)
{
    mkdirSync(dirname(dst), { recursive: true });
    cpSync(src, dst);
}

function copyDirectory(src, dst)
{
    cpSync(src, dst, { recursive: true });
}


/******************************************************************************/
/* REPORT                                                                     */
/******************************************************************************/

function walk(dir, files = [])
{
    for(const name of readdirSync(dir))
    {
        const full = join(dir, name);
        const stat = statSync(full);
        if(stat.isDirectory()) { walk(full, files); }
        else                   { files.push({ path: full, size: stat.size }); }
    }
    return files;
}

function formatBytes(bytes)
{
    if(bytes < 1024)        { return `${bytes} B`; }
    if(bytes < 1024 * 1024) { return `${(bytes / 1024).toFixed(1)} KB`; }
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}


/******************************************************************************/
/* MAIN                                                                       */
/******************************************************************************/

function main()
{
    for(const file of FILES)      { ensureExists(resolve(ROOT, file)); }
    for(const dir  of DIRECTORIES) { ensureExists(resolve(ROOT, dir));  }

    wipeOutput();

    for(const file of FILES)
    {
        copyFile(resolve(ROOT, file), resolve(OUTPUT, file));
    }
    for(const dir of DIRECTORIES)
    {
        copyDirectory(resolve(ROOT, dir), resolve(OUTPUT, dir));
    }

    const files = walk(OUTPUT);
    const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

    console.log(`Deploy bundle written to ${relative(ROOT, OUTPUT)}/`);
    console.log(`  ${files.length.toLocaleString()} files, ${formatBytes(totalBytes)} total`);
}

main();
