// Packages a per-platform VSIX: installs exactly the @node-llama-cpp binary
// variants for the target, prunes every other variant, then runs
// `vsce package --target`. Any host OS can package any target because the
// binaries are plain npm packages (no compilation).
// Run with: npm run package:vsix -- <target>
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const VARIANTS = {
  "win32-x64": ["win-x64", "win-x64-vulkan"],
  "win32-arm64": ["win-arm64"],
  "linux-x64": ["linux-x64", "linux-x64-vulkan"],
  "linux-arm64": ["linux-arm64"],
  "darwin-x64": ["mac-x64"],
  "darwin-arm64": ["mac-arm64-metal"],
};

const target = process.argv[2];
if (!VARIANTS[target]) {
  console.error(`Usage: node scripts/package-vsix.mjs <${Object.keys(VARIANTS).join("|")}>`);
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const scopeDir = join(root, "node_modules", "@node-llama-cpp");
const nlc = JSON.parse(
  readFileSync(join(root, "node_modules", "node-llama-cpp", "package.json"), "utf8"),
);

// 1. Force-install the wanted variants at the exact versions node-llama-cpp
//    pins in its optionalDependencies. --force bypasses npm's os/cpu check so
//    cross-target packaging works; --no-save keeps package.json/lock clean.
const wanted = VARIANTS[target].map((v) => {
  const pkg = `@node-llama-cpp/${v}`;
  const version = nlc.optionalDependencies?.[pkg];
  if (!version) throw new Error(`${pkg} is not an optionalDependency of node-llama-cpp`);
  return `${pkg}@${version}`;
});
run(`npm install --no-save --force ${wanted.join(" ")}`);

// 2. Prune every variant not wanted for this target (step 1 may also have
//    "healed" host-matching variants back in — delete those too).
if (existsSync(scopeDir)) {
  for (const dir of readdirSync(scopeDir)) {
    if (!VARIANTS[target].includes(dir)) {
      console.log(`prune @node-llama-cpp/${dir}`);
      rmSync(join(scopeDir, dir), { recursive: true, force: true });
    }
  }
}

// 3. Package. vsce runs vscode:prepublish (check-types + lint + production
//    esbuild) and bundles the production dependency tree that remains.
mkdirSync(join(root, "dist-vsix"), { recursive: true });
run(`npx vsce package --target ${target} --out dist-vsix/`);

function run(cmd) {
  console.log(`$ ${cmd}`);
  execSync(cmd, { cwd: root, stdio: "inherit" });
}
