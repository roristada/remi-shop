/**
 * Renders .do/app.template.yaml into .do/app.yaml (gitignored) for `doctl apps create|update --spec`.
 * Values come from the shell first, then .env.local, then .env. DEPLOY_BRANCH and NEXT_PUBLIC_SITE_URL
 * come from the shell only (the .env site URL is localhost):
 *   $env:DEPLOY_BRANCH='master'; $env:NEXT_PUBLIC_SITE_URL='https://remii.cc'; npm run do:spec
 */
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { parse } from "dotenv";
import { envLookup, renderAppSpec } from "../lib/deploy/app-spec";

const readEnvFile = (file: string): Record<string, string> => (existsSync(file) ? parse(readFileSync(file)) : {});

const lookup = envLookup(process.env, [readEnvFile(".env.local"), readEnvFile(".env")], [
  "DEPLOY_BRANCH",
  "NEXT_PUBLIC_SITE_URL",
]);
const template = readFileSync(".do/app.template.yaml", "utf8");
const spec = renderAppSpec(template, lookup);
writeFileSync(".do/app.yaml", spec);
console.log("Wrote .do/app.yaml (contains secrets; gitignored)");
