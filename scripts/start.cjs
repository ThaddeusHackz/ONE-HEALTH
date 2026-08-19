const { spawn } = require("child_process");

const port = process.env.PORT || "3000";
const child = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "0.0.0.0", "-p", String(port)],
  { stdio: "inherit" },
);

child.on("exit", (code) => process.exit(code ?? 0));
