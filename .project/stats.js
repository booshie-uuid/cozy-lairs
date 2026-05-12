#!/usr/bin/env node
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, extname } from "node:path";
import { fileURLToPath } from "node:url";


/******************************************************************************/
/* PATHS                                                                      */
/******************************************************************************/

const HERE   = dirname(fileURLToPath(import.meta.url));
const ROOT   = resolve(HERE, "..");
const OUTPUT = resolve(HERE, "stats.json");

const EXCLUDE_DIRS = new Set(["node_modules", "libs", ".claude", ".git"]);


/******************************************************************************/
/* LANGUAGE TABLES                                                            */
/******************************************************************************/

const CODE_LANGUAGES =
{
    ".js":   "javascript",
    ".mjs":  "javascript",
    ".html": "html",
    ".css":  "css"
};

const COMMENT_SYNTAX =
{
    javascript: { line: "//", blockStart: "/*",   blockEnd: "*/"  },
    css:        { line: null, blockStart: "/*",   blockEnd: "*/"  },
    html:       { line: null, blockStart: "<!--", blockEnd: "-->" }
};

const DOC_CATEGORIES = new Set(["plans", "designs", "reviews"]);


/******************************************************************************/
/* FILE WALK                                                                  */
/******************************************************************************/

function walk(dir, onFile)
{
    for(const name of readdirSync(dir))
    {
        if(EXCLUDE_DIRS.has(name)) { continue; }
        const full = join(dir, name);
        const stat = statSync(full);
        if(stat.isDirectory()) { walk(full, onFile); }
        else                   { onFile(full); }
    }
}


/******************************************************************************/
/* COUNTERS                                                                   */
/******************************************************************************/

function countWords(text)
{
    const trimmed = text.trim();
    if(trimmed.length === 0) { return 0; }
    return trimmed.split(/\s+/).length;
}


function analyzeCode(content, language)
{
    const syntax = COMMENT_SYNTAX[language];

    let eloc = 0;
    let commentWords = 0;
    let inBlock = false;

    const lines = content.split(/\r?\n/);

    for(const line of lines)
    {
        let i = 0;
        let effective = "";

        while(i < line.length)
        {
            if(inBlock)
            {
                const end = line.indexOf(syntax.blockEnd, i);
                if(end === -1)
                {
                    commentWords += countWords(line.slice(i));
                    i = line.length;
                }
                else
                {
                    commentWords += countWords(line.slice(i, end));
                    i = end + syntax.blockEnd.length;
                    inBlock = false;
                }
            }
            else
            {
                const blockIdx = line.indexOf(syntax.blockStart, i);
                const lineIdx  = syntax.line ? line.indexOf(syntax.line, i) : -1;

                if(lineIdx !== -1 && (blockIdx === -1 || lineIdx < blockIdx))
                {
                    effective += line.slice(i, lineIdx);
                    commentWords += countWords(line.slice(lineIdx + syntax.line.length));
                    i = line.length;
                }
                else if(blockIdx !== -1)
                {
                    effective += line.slice(i, blockIdx);
                    inBlock = true;
                    i = blockIdx + syntax.blockStart.length;
                }
                else
                {
                    effective += line.slice(i);
                    i = line.length;
                }
            }
        }

        if(effective.trim().length > 0) { eloc++; }
    }

    return { eloc, commentWords };
}


function categoriseDoc(filePath)
{
    const parts = filePath.split(/[\\/]/);
    const projectIdx = parts.indexOf(".project");
    if(projectIdx === -1)                            { return "other"; }
    if(projectIdx + 1 >= parts.length)               { return "other"; }
    const sub = parts[projectIdx + 1];
    return DOC_CATEGORIES.has(sub) ? sub : "other";
}


/******************************************************************************/
/* MAIN                                                                       */
/******************************************************************************/

const stats =
{
    generatedAt:   new Date().toISOString(),
    code:          {},
    documentation: {}
};

walk(ROOT, file =>
{
    const ext = extname(file).toLowerCase();
    const language = CODE_LANGUAGES[ext];

    if(language)
    {
        const content = readFileSync(file, "utf8");
        const { eloc, commentWords } = analyzeCode(content, language);
        const bucket = stats.code[language] || (stats.code[language] = { files: 0, eloc: 0, commentWords: 0 });
        bucket.files        += 1;
        bucket.eloc         += eloc;
        bucket.commentWords += commentWords;
        return;
    }

    if(ext === ".md")
    {
        const category = categoriseDoc(file);
        const bucket = stats.documentation[category] || (stats.documentation[category] = { files: 0, words: 0 });
        bucket.files += 1;
        bucket.words += countWords(readFileSync(file, "utf8"));
    }
});

writeFileSync(OUTPUT, JSON.stringify(stats, null, 2) + "\n");
console.log(`Wrote ${OUTPUT}`);
