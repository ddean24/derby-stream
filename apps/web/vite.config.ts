import { copyFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const dataDir = fileURLToPath(new URL("../../data", import.meta.url));

function copyDataFiles(): Plugin {
	return {
		name: "derby-streams:copy-data",
		closeBundle() {
			const outDir = resolve(rootDir, "dist", "data");
			mkdirSync(outDir, { recursive: true });
			for (const file of ["fixtures.json", "streams.json"] as const) {
				copyFileSync(resolve(dataDir, file), resolve(outDir, file));
			}
			// Self-hosted crests (ROADMAP.md item 8.7): copy the whole
			// data/crests/ dir into dist/crests/ so the site never hotlinks the
			// football-data CDN. Fixtures reference these as "crests/{id}.svg",
			// which resolves against dist/crests/. The dir is committed but
			// tolerant of being empty (everyone falls back to monograms).
			const crestsDir = resolve(dataDir, "crests");
			const outCrestsDir = resolve(rootDir, "dist", "crests");
			mkdirSync(outCrestsDir, { recursive: true });
			if (existsSync(crestsDir)) {
				for (const file of readdirSync(crestsDir)) {
					copyFileSync(resolve(crestsDir, file), resolve(outCrestsDir, file));
				}
			}
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), copyDataFiles()],
	base: "./",
});
