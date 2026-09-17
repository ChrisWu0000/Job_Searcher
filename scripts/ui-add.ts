import { Glob } from "bun";

const projectRoot = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const uiDirectory = `${projectRoot}src/components/ui`;
const components = process.argv.slice(2);

if (components.length === 0) {
  console.error("usage: bun run ui:add <component> [...components]");
  process.exit(1);
}

async function run(command: string[]): Promise<number> {
  const child = Bun.spawn(command, { cwd: projectRoot, stdout: "inherit", stderr: "inherit" });
  return child.exited;
}

const addExitCode = await run([
  "bun",
  "x",
  "--bun",
  "shadcn@latest",
  "add",
  "--yes",
  ...components,
]);
if (addExitCode !== 0) process.exit(addExitCode);

const generatedGlob = new Glob("*.tsx");
let rewritten = 0;
for await (const relativePath of generatedGlob.scan({ cwd: uiDirectory })) {
  const absolutePath = `${uiDirectory}/${relativePath}`;
  const source = await Bun.file(absolutePath).text();
  const normalized = source.replaceAll('from "cn"', 'from "@/lib/utils"');
  if (normalized === source) continue;
  await Bun.write(absolutePath, normalized);
  rewritten += 1;
}

const manifest = await Bun.file(`${projectRoot}package.json`).json();
if (manifest.dependencies?.cn !== undefined) {
  await run(["bun", "remove", "cn"]);
}

await run(["bun", "x", "biome", "check", "--write", "src/components/ui"]);

console.log(`ui:add: normalized ${rewritten} generated component(s)`);
