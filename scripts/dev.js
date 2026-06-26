import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bin = process.platform === "win32" ? "vite.cmd" : "vite";
const vitePath = path.join(root, "node_modules", ".bin", bin);

const children = [
  spawn(process.execPath, ["server/index.js"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, PORT: process.env.PORT || "3001" }
  }),
  spawn(vitePath, ["--host", "0.0.0.0"], {
    cwd: root,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: { ...process.env, VITE_API_BASE: process.env.VITE_API_BASE || "http://localhost:3001" }
  })
];

const shutdown = () => {
  for (const child of children) child.kill();
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

for (const child of children) {
  child.on("exit", (code) => {
    if (code && code !== 0) process.exit(code);
  });
}
