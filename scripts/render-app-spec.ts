/**
 * Renders .do/app.template.yaml into .do/app.yaml (gitignored) for `doctl apps create|update --spec`.
 * Values come from the shell first, then .env.local, then .env. The shell must set DEPLOY_BRANCH and
 * NEXT_PUBLIC_SITE_URL (the .env one is localhost):
 *   $env:DEPLOY_BRANCH='master'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { renderAppSpec } from "../lib/deploy/app-spec";

const readEnvFile = (file: string): Record<string, string> => (existsSync(file) ? parse(readFileSync(file)) : {});
const local = readEnvFile(".env.local");
const base = readEnvFile(".env");

const template = readFileSync(".do/app.template.yaml", "utf8");
const spec = renderAppSpec(template, (key) => process.env[key] ?? local[key] ?? base[key]);
writeFileSync(".do/app.yaml", spec);
console.log("Wrote .do/app.yaml (contains secrets; gitignored)");
