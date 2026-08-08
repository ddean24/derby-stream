import { copyFileSync, mkdirSync } from "node:fs";
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
		},
	};
}

export default defineConfig({
	plugins: [react(), tailwindcss(), copyDataFiles()],
	base: "./",
});
