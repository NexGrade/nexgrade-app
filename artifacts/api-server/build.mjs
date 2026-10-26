import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build as esbuild, transform } from "esbuild";
import esbuildPluginPino from "esbuild-plugin-pino";
import { rm, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import { pathToFileURL } from "node:url";
import JavaScriptObfuscator from "javascript-obfuscator";

// Plugins (e.g. 'esbuild-plugin-pino') may use `require` to resolve dependencies
globalThis.require = createRequire(import.meta.url);

const artifactDir = path.dirname(fileURLToPath(import.meta.url));


// [RCO-SCRIPT-OFUSCADO] (26/10/2026) o script de gravacao no RCO roda no navegador da escola (qualquer um
// le). No build, a linha `const OFUSCADO: string | null = null;` de src/lib/rco-script.ts vira o
// programa do navegador ofuscado. Em teste/dev continua o legivel.
const MARCADOR_RCO = "const OFUSCADO: string | null = null;";
const pluginOfuscarScriptRco = {
  name: "ofuscar-script-rco",
  setup(b) {
    b.onLoad({ filter: /[\\/]src[\\/]lib[\\/]rco-script\.ts$/ }, async (args) => {
      const fonte = await readFile(args.path, "utf8");
      if (!fonte.includes(MARCADOR_RCO)) throw new Error("rco-script.ts: marcador do script ofuscado nao encontrado");
      const js = (await transform(fonte, { loader: "ts", format: "esm" })).code;
      const tmp = path.join(os.tmpdir(), `rco-script-${process.pid}-${Date.now()}.mjs`);
      await writeFile(tmp, js);
      let programa;
      try { programa = (await import(pathToFileURL(tmp).href)).programaDoNavegador(); } finally { await rm(tmp, { force: true }); }
      const ofuscado = JavaScriptObfuscator.obfuscate(programa, {
        target: "browser", compact: true, simplify: true,
        identifierNamesGenerator: "hexadecimal", renameGlobals: false,
        stringArray: true, stringArrayEncoding: ["base64"], stringArrayThreshold: 1, rotateStringArray: true, shuffleStringArray: true,
        splitStrings: true, splitStringsChunkLength: 6,
        controlFlowFlattening: false, deadCodeInjection: false, selfDefending: false, debugProtection: false,
        unicodeEscapeSequence: false,
      }).getObfuscatedCode();
      return { contents: fonte.replace(MARCADOR_RCO, `const OFUSCADO: string | null = ${JSON.stringify(ofuscado)};`), loader: "ts" };
    });
  },
};

async function buildAll() {
  const distDir = path.resolve(artifactDir, "dist");
  await rm(distDir, { recursive: true, force: true });

  await esbuild({
    entryPoints: [path.resolve(artifactDir, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "esm",
    outdir: distDir,
    outExtension: { ".js": ".mjs" },
    logLevel: "info",
    // Some packages may not be bundleable, so we externalize them, we can add more here as needed.
    // Some of the packages below may not be imported or installed, but we're adding them in case they are in the future.
    // Examples of unbundleable packages:
    // - uses native modules and loads them dynamically (e.g. sharp)
    // - use path traversal to read files (e.g. @google-cloud/secret-manager loads sibling .proto files)
    external: [
      "*.node",
      "sharp",
      "better-sqlite3",
      "sqlite3",
      "canvas",
      "bcrypt",
      "argon2",
      "fsevents",
      "re2",
      "farmhash",
      "xxhash-addon",
      "bufferutil",
      "utf-8-validate",
      "ssh2",
      "cpu-features",
      "dtrace-provider",
      "isolated-vm",
      "lightningcss",
      "pg-native",
      "oracledb",
      "mongodb-client-encryption",
      "nodemailer",
      "handlebars",
      "knex",
      "typeorm",
      "protobufjs",
      "onnxruntime-node",
      "@tensorflow/*",
      "@prisma/client",
      "@mikro-orm/*",
      "@grpc/*",
      "@swc/*",
      "@aws-sdk/*",
      "@azure/*",
      "@opentelemetry/*",
      "@google-cloud/*",
      "@google/*",
      "googleapis",
      "firebase-admin",
      "@parcel/watcher",
      "@sentry/profiling-node",
      "@tree-sitter/*",
      "aws-sdk",
      "classic-level",
      "dd-trace",
      "ffi-napi",
      "grpc",
      "hiredis",
      "kerberos",
      "leveldown",
      "miniflare",
      "mysql2",
      "newrelic",
      "odbc",
      "piscina",
      "realm",
      "ref-napi",
      "rocksdb",
      "sass-embedded",
      "sequelize",
      "serialport",
      "snappy",
      "tinypool",
      "usb",
      "workerd",
      "wrangler",
      "zeromq",
      "zeromq-prebuilt",
      "playwright",
      "puppeteer",
      "puppeteer-core",
      "electron",
    ],
    sourcemap: "linked",
    plugins: [
      pluginOfuscarScriptRco, // [RCO-SCRIPT-OFUSCADO]
      // pino relies on workers to handle logging, instead of externalizing it we use a plugin to handle it
      esbuildPluginPino({ transports: ["pino-pretty"] })
    ],
    // Make sure packages that are cjs only (e.g. express) but are bundled continue to work in our esm output file
    banner: {
      js: `import { createRequire as __bannerCrReq } from 'node:module';
import __bannerPath from 'node:path';
import __bannerUrl from 'node:url';

globalThis.require = __bannerCrReq(import.meta.url);
globalThis.__filename = __bannerUrl.fileURLToPath(import.meta.url);
globalThis.__dirname = __bannerPath.dirname(globalThis.__filename);
    `,
    },
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
