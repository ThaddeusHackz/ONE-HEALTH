const { spawn } = require("child_process");

const port = process.env.PORT || "3000";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", String(port)],
  { stdio: "inherit" },
);

function shut(signal) {
  if (!child.killed) child.kill(signal);
}

process.on("SIGTERM", () => shut("SIGTERM"));
process.on("SIGINT", () => shut("SIGINT"));
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});
