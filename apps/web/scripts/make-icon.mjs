/**
 * Generates the PWA icons (public/icons/icon-192.png, icon-512.png,
 * apple-touch-icon.png) for the web app manifest.
 *
 * Pure Node + zlib PNG encoder — zero dependencies, fully self-contained. The
 * glyph is a simple one: a slate-950 badge with an amber ring and a white
 * football-style ball, so it reads at home-screen sizes without needing any AI
 * or raster tooling in the repo.
 *
 * Run: node apps/web/scripts/make-icon.mjs
 */

import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const outDir = fileURLToPath(new URL("../public/icons/", import.meta.url));
mkdirSync(outDir, { recursive: true });

// --- minimal PNG encoder (8-bit RGBA, no interlace) ---

const CRC_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
	let c = i;
	for (let k = 0; k < 8; k++) {
		c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
	}
	CRC_TABLE[i] = c >>> 0;
}

function crc32(buf) {
	let c = 0xffffffff;
	for (let i = 0; i < buf.length; i++) {
		c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
	}
	return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
	const len = Buffer.alloc(4);
	len.writeUInt32BE(data.length, 0);
	const typeBuf = Buffer.from(type, "ascii");
	const crcBuf = Buffer.alloc(4);
	crcBuf.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
	return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function png(width, height, rgba) {
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(width, 0);
	ihdr.writeUInt32BE(height, 4);
	ihdr[8] = 8; // bit depth
	ihdr[9] = 6; // RGBA
	const stride = width * 4;
	const raw = Buffer.alloc((stride + 1) * height);
	for (let y = 0; y < height; y++) {
		raw[y * (stride + 1)] = 0; // filter: None
		rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
	}
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk("IHDR", ihdr),
		chunk("IDAT", deflateSync(raw, { level: 9 })),
		chunk("IEND", Buffer.alloc(0)),
	]);
}

// --- drawing ---

const BG = [15, 23, 42]; // slate-950
const RING = [245, 158, 11]; // amber-500
const BALL_LIGHT = [250, 250, 250];
const BALL_DARK = [148, 163, 184]; // slate-400

function shade(color, factor) {
	return color.map((v) => Math.max(0, Math.min(255, Math.round(v * factor))));
}

function drawIcon(sizePx) {
	const px = Buffer.alloc(sizePx * sizePx * 4);
	const cx = sizePx / 2;
	const cy = sizePx / 2;
	const ringOuter = sizePx * 0.46;
	const ringInner = sizePx * 0.38;
	const ballR = sizePx * 0.3;

	for (let y = 0; y < sizePx; y++) {
		for (let x = 0; x < sizePx; x++) {
			const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
			const i = (y * sizePx + x) * 4;
			let color = BG;
			if (d >= ringInner && d <= ringOuter) {
				// Amber ring, slightly dimmer toward the outer edge.
				color = RING.map((v) => Math.round(v * (1 - (d - ringInner) / (ringOuter - ringInner) * 0.25)));
			} else if (d <= ringInner * 0.985) {
				// Ball: light top-left -> dark bottom-right for a little depth,
				// and a thin amber rim right where the ball meets the ring.
				const rim = sizePx * 0.005;
				if (d > ringInner * 0.985 - rim * 6) {
					color = RING;
				} else {
					// Light top-left -> dark bottom-right for a little depth;
					// interpolate BALL_LIGHT toward BALL_DARK as t goes 0..1.
					const t = (x / sizePx + y / sizePx) / 2;
					color = [
						Math.round(BALL_LIGHT[0] + (BALL_DARK[0] - BALL_LIGHT[0]) * t),
						Math.round(BALL_LIGHT[1] + (BALL_DARK[1] - BALL_LIGHT[1]) * t),
						Math.round(BALL_LIGHT[2] + (BALL_DARK[2] - BALL_LIGHT[2]) * t),
					];
				}
			}
			px[i] = color[0];
			px[i + 1] = color[1];
			px[i + 2] = color[2];
			px[i + 3] = 255;
		}
	}
	return png(sizePx, sizePx, px);
}

writeFileSync(join(outDir, "icon-192.png"), drawIcon(192));
writeFileSync(join(outDir, "icon-512.png"), drawIcon(512));
writeFileSync(join(outDir, "apple-touch-icon.png"), drawIcon(180));
console.log("wrote public/icons/{icon-192.png, icon-512.png, apple-touch-icon.png}");