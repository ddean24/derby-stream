import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

const rootElement = document.getElementById("root");

if (rootElement === null) {
	throw new Error("Root element #root not found");
}

createRoot(rootElement).render(
	<StrictMode>
		<App />
	</StrictMode>,
);

// Service worker for installability + offline (ROADMAP 8.3). Registered at the
// end of a successful load so it never delays first paint; production-only so
// the Vite dev server (which doesn't serve public/sw.js from the module graph)
// stays untouched.
if (import.meta.env.PROD && "serviceWorker" in navigator) {
	window.addEventListener("load", () => {
		navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch((error) => {
			console.error("[pwa] service worker registration failed", error);
		});
	});
}
