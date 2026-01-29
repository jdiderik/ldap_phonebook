import state from "./js/lib/state";
import { setup } from "./js/routes";

/** API base URL: dev uses API_PORT (default 8188); production uses same origin. */
const apiPort = process.env.API_PORT || process.env.PORT || "8188";

/**
 * Global app config and lifecycle. Exposed as window.app.
 * @property {string} root - API base URL (e.g. http://127.0.0.1:8188/api).
 * @property {boolean} auth - Whether the user is authenticated.
 * @property {boolean} isAdmin - Whether the user is in ADMIN_USERS (details, admin page, manual users).
 * @property {Object} state - Reference to the state module.
 */
export const app = {
    root: process.env.NODE_ENV !== "production"
        ? `http://127.0.0.1:${apiPort}/api`
        : `${window.location.origin}/api`,
	auth: false,
	isAdmin: false,
    /** Restores session from tokens, then sets up routes. Called on DOMContentLoaded. */
    init: async () => {
        async function restoreSessionWithRefresh() {
            const ref = state.getRefreshToken();
            if (!ref) return;
            const res = await fetch(`${app.root}/refresh`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ refreshToken: ref }),
            });
            if (!res.ok) {
                state.clearToken();
                return;
            }
            const data = await res.json();
            if (data.error) {
                state.clearToken();
                return;
            }
            state.saveTokens(data.accessToken, data.refreshToken);
            app.auth = true;
            app.isAdmin = !!data.user?.isAdmin;
        }
        const accessToken = state.getToken();
        const refreshToken = state.getRefreshToken();
        if (accessToken || refreshToken) {
            try {
                if (accessToken) {
                    const res = await fetch(`${app.root}/me`, {
                        headers: { Authorization: `Bearer ${accessToken}` },
                    });
                    if (res.ok) {
                        const data = await res.json();
                        app.auth = true;
                        app.isAdmin = !!data.user?.isAdmin;
                    } else if (res.status === 401 && refreshToken) {
                        await restoreSessionWithRefresh();
                    } else {
                        state.clearToken();
                    }
                } else {
                    await restoreSessionWithRefresh();
                }
            } catch {
                state.clearToken();
            }
        }
        await setup();
    },
    stop: () => {
        // Cleanup if needed
    },
    state: state
};

document.addEventListener('DOMContentLoaded', app.init , false);
window.addEventListener('beforeunload', app.stop, false);
window.app = app;

if (typeof module !== "undefined" && module.hot) {
	module.hot.accept(() => {
		window.location.reload();
	});
}
