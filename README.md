# RubiksSimulator

Build to dis/web:
node -e 'import("barely-a-dev-server").then(s => s.barelyServe({entryRoot: "src", dev: false, outDir: "dist/web"}))'

Build to Dev:
node -e 'import("barely-a-dev-server").then(s => s.barelyServe({entryRoot: "src"}))'
