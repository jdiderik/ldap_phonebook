import m, { route } from "mithril";
import state from "./lib/state";
import { vwHome } from "./views/vwHome";
import { vwLogin } from "./views/vwLogin";
import { vwAdmin } from "./views/vwAdmin";
import { app } from "..";

/**
 * Initializes Mithril routes and mounts the app on #root. Called from app.init.
 * @returns {Promise<void>}
 */
const setup = async () => {
	await state.init();
	route(document.getElementById("root"), "/", {
		"/": {
			onmatch: () => {
				route.set("/home", {}, { replace: true });
			},
		},
		"/login": {
			onmatch: () => {
				if (app.auth) {
					route.set("/home", {}, { replace: true });
				}
			},
			render: () => m(vwLogin),
		},
		"/home": {
			render: () => m(vwHome),
		},
		"/admin": {
			onmatch: () => {
				if (!app.isAdmin) {
					route.set("/home", {}, { replace: true });
				}
			},
			render: () => m(vwAdmin),
		},
	});
};

export { setup };