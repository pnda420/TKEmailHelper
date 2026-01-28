import { writeFileSync, existsSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Domain setzen – per ENV überschreibbar:
 *   BASE_URL=https://Leonards & Brandenburger IT.de npm run build
 */
const BASE_URL = (process.env.BASE_URL || "https://Leonards & Brandenburger IT.de").replace(/\/+$/, "");

/**
 * Statische, öffentliche Routen (aus deiner Liste, aber ohne Admin/Auth/Preview).
 * Passe diese Liste an, falls du noch mehr veröffentlichen willst.
 */
const STATIC_ROUTES = [
    "/",                // Home
    "/services",
    "/about",
    "/contact",
    "/imprint",
    "/process",
    "/faq",
    "/policy",
    "/booking",
    "/survey",
    "/it-services"
];

/**
 * Dynamische Services: /services/:slug
 * Lies optionale Slugs aus src/data/service-slugs.json
 * Formatbeispiel:
 * { "slugs": ["one-pager","all-in-one","large-website","seo-optimization","full-stack-development"] }
 */
function readServiceSlugs() {
    try {
        const p = "src/data/service-slugs.json";
        if (!existsSync(p)) return [];
        const json = JSON.parse(readFileSync(p, "utf8"));
        const arr = Array.isArray(json) ? json : json.slugs;
        return Array.isArray(arr) ? arr.filter(Boolean) : [];
    } catch {
        return [];
    }
}

const serviceSlugs = readServiceSlugs();
const DYNAMIC_ROUTES = serviceSlugs.map(slug => `/services/${slug}`);

/**
 * Final: Alle URLs, doppelte raus, sortiert
 */
const allPaths = Array.from(new Set([...STATIC_ROUTES, ...DYNAMIC_ROUTES]));
allPaths.sort((a, b) => a.localeCompare(b));

/**
 * lastmod: heute im YYYY-MM-DD
 */
const today = new Date().toISOString().slice(0, 10);

/**
 * Prioritäten & changefreq: simple Heuristik
 */
function getMeta(path) {
    if (path === "/") return { priority: "1.0", changefreq: "weekly" };
    if (path.startsWith("/services/")) return { priority: "0.7", changefreq: "monthly" };
    if (path === "/services") return { priority: "0.8", changefreq: "weekly" };
    return { priority: "0.6", changefreq: "monthly" };
}

/**
 * sitemap.xml bauen (ohne externes Paket)
 */
function buildSitemapXml() {
    const urlsXml = allPaths.map(p => {
        const { priority, changefreq } = getMeta(p);
        const loc = `${BASE_URL}${p === "/" ? "/" : p}`;
        return [
            "  <url>",
            `    <loc>${loc}</loc>`,
            `    <changefreq>${changefreq}</changefreq>`,
            `    <priority>${priority}</priority>`,
            `    <lastmod>${today}</lastmod>`,
            "  </url>"
        ].join("\n");
    }).join("\n");

    return [
        `<?xml version="1.0" encoding="UTF-8"?>`,
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
        urlsXml,
        `</urlset>`
    ].join("\n");
}

/**
 * robots.txt bauen (mit absoluter Sitemap-URL)
 */
function buildRobotsTxt() {
    return [
        `User-agent: *`,
        `Allow: /`,
        ``,
        `Sitemap: ${BASE_URL}/sitemap.xml`
    ].join("\n");
}

/**
 * Dateien nach src/ schreiben (werden per assets ins Webroot kopiert)
 */
function ensureDirFor(filePath) {
    const dir = filePath.split("/").slice(0, -1).join("/");
    if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function writeFile(path, content) {
    ensureDirFor(path);
    writeFileSync(path, content, "utf8");
    console.log(`✓ ${path} geschrieben`);
}

writeFile("src/sitemap.xml", buildSitemapXml());
writeFile("src/robots.txt", buildRobotsTxt());
