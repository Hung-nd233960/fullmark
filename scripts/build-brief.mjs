// Copies the brief question file into dist/brief/ (`quiz brief` reads it at run time, as data; `check` never does).
import { copyFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
mkdirSync(join(root, "dist", "brief"), { recursive: true });
copyFileSync(join(root, "src", "brief", "questions.yaml"), join(root, "dist", "brief", "questions.yaml"));
