/**
 * @fileoverview Global app state: phone list, favorites, auth tokens, and API helpers (requestWithAuth, loadPhonelist, etc.).
 */
import { redraw, request } from 'mithril';
import { app } from '../..';

const tokenKey = 'phonebook';
const refreshTokenKey = 'phonebook-refresh';
const menuKey = 'phonebook-menu';

/** @param {...*} args - Forwarded to console.debug. */
const log = (...args) => {
	console.debug(...args);
};

const getToken = () => {
	return localStorage.getItem(tokenKey);
};

const getRefreshToken = () => {
	return localStorage.getItem(refreshTokenKey);
};

const saveToken = (token) => {
	localStorage.setItem(tokenKey, token);
};

const saveTokens = (accessToken, refreshToken) => {
	if (accessToken) localStorage.setItem(tokenKey, accessToken);
	if (refreshToken) localStorage.setItem(refreshTokenKey, refreshToken);
};

const clearToken = () => {
	localStorage.removeItem(tokenKey);
	localStorage.removeItem(refreshTokenKey);
};

const doLogout = () => {
	clearToken();
	app.auth = false;
	app.isAdmin = false;
	state.favorites = [];
	redraw();
};

/**
 * Performs an authenticated API request. Adds Bearer token; on 401 tries refresh once and retries; on refresh failure logs out.
 * @param {Object} options - Fetch-style options (url, method, body, timeout, headers).
 * @returns {Promise<Object|string>} Parsed JSON or text response body.
 * @throws {Error} On non-2xx (after refresh attempt) or when refresh fails.
 */
const requestWithAuth = async (options) => {
	const url = options.url;
	const method = (options.method || 'GET').toUpperCase();
	const timeout = options.timeout || 5000;
	const body = options.body != null ? JSON.stringify(options.body) : undefined;
	let headers = { ...(options.headers || {}) };
	if (body !== undefined) headers['Content-Type'] = 'application/json';

	const doOne = async (accessToken) => {
		const ctrl = new AbortController();
		const id = setTimeout(() => ctrl.abort(), timeout);
		try {
			const res = await fetch(url, {
				method,
				headers: { ...headers, Authorization: 'Bearer ' + accessToken },
				body: method !== 'GET' && body !== undefined ? body : undefined,
				signal: ctrl.signal,
			});
			clearTimeout(id);
			if (res.status === 401) return { _401: true };
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text || res.statusText || 'Request failed');
			}
			const contentType = res.headers.get('Content-Type') || '';
			if (contentType.includes('application/json')) return res.json();
			return res.text();
		} catch (e) {
			clearTimeout(id);
			throw e;
		}
	};

	let token = getToken();
	let result = await doOne(token || '');
	if (result && result._401) {
		const refreshToken = getRefreshToken();
		if (!refreshToken) {
			doLogout();
			throw new Error('Unauthorized');
		}
		const ctrl = new AbortController();
		const id = setTimeout(() => ctrl.abort(), timeout);
		let refreshRes;
		try {
			refreshRes = await fetch(app.root + '/refresh', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ refreshToken }),
				signal: ctrl.signal,
			});
		} catch (e) {
			clearTimeout(id);
			doLogout();
			throw e;
		}
		clearTimeout(id);
		if (!refreshRes.ok) {
			doLogout();
			throw new Error('Session expired');
		}
		const data = await refreshRes.json();
		if (data.error) {
			doLogout();
			throw new Error(data.error);
		}
		saveTokens(data.accessToken, data.refreshToken);
		result = await doOne(data.accessToken);
	}
	return result;
};

/** Placeholder for state init; login/restore is handled in app.init. */
const init = async () => {};

/** Fetches the current user's favorites from the API and updates state.favorites. */
const loadFavorites = async () => {
	if (!app.auth) {
		state.favorites = [];
		return;
	}
	if (!getToken() && !getRefreshToken()) {
		state.favorites = [];
		return;
	}
	try {
		const result = await requestWithAuth({
			url: app.root + '/favorites',
			timeout: 5000,
		});
		state.favorites = result && Array.isArray(result.favorites) ? result.favorites : [];
	} catch (err) {
		state.favorites = [];
	}
};

/**
 * Adds a contact to the user's favorites. Uses opaque id (no dn exposed).
 * @param {{ id: string, displayName?: string }} contact - Contact with id (opaque) and optional display name.
 */
const addFavorite = async (contact) => {
	if (!app.auth || !contact || !contact.id) return;
	if (!getToken() && !getRefreshToken()) return;
	try {
		const result = await requestWithAuth({
			method: 'POST',
			url: app.root + '/favorites',
			body: { id: contact.id, displayName: contact.displayName || contact.fullName || '' },
			timeout: 5000,
		});
		if (result && Array.isArray(result.favorites)) state.favorites = result.favorites;
		const cIdx = state._phoneList.findIndex((f) => f.id === contact.id);
		if (cIdx >= 0) state._phoneList[cIdx].isFav = true;
	} catch (err) {
		console.error('addFavorite:', err);
	}
};

/**
 * Removes a contact from the user's favorites. Uses opaque id.
 * @param {{ id: string }} contact - Contact with id (opaque).
 */
const removeFavorite = async (contact) => {
	if (!app.auth || !contact || !contact.id) return;
	if (!getToken() && !getRefreshToken()) return;
	try {
		await requestWithAuth({
			method: 'DELETE',
			url: app.root + '/favorites/' + encodeURIComponent(contact.id),
			timeout: 5000,
		});
		state.favorites = state.favorites.filter((f) => f && f.id !== contact.id);
		const cIdx = state._phoneList.findIndex((f) => f.id === contact.id);
		if (cIdx >= 0) state._phoneList[cIdx].isFav = false;
	} catch (err) {
		console.error('removeFavorite:', err);
	}
};

/** Fetches the full phonebook from the API. When logged in, sends Bearer token so admin gets full user objects. */
const fetchPhonebook = async () => {
	try {
		const url = app.root + '/users';
		const timeout = 3000;
		let result;
		if (getToken()) {
			result = await requestWithAuth({ url, timeout });
		} else {
			result = await request({ url, timeout });
		}

		const phonebook =
			Array.isArray(result)
				? result
				: (result && Array.isArray(result.phonebook) ? result.phonebook : null);

		if (phonebook) {
			state.log('LOADING PHONEBOOK');
			return phonebook;
		}
		return [];
	} catch (err) {
		return [];
	}
};

/** Loads phonebook from API, merges favorites, and updates state; calls processPhonelistData. */
const loadPhonelist = async () => {
	try {
		// Always fetch fresh data from the API
		let freshData = await fetchPhonebook();
		if(freshData.length){
			log('phonebook loaded', freshData.length);
			processPhonelistData(freshData);
		}else{
			// If API fails, show empty list
			processPhonelistData([]);
		}
	} catch (err) {
		log(err);
		processPhonelistData([]);
	}
};

/**
 * Sets state._phoneList from data, marks isFav from state.favorites, then runs filterList and redraws.
 * @param {Object[]} [data] - Raw user array from the API.
 */
const processPhonelistData = (data = []) => {
		// if supplied, set _phonelist
		if(data) state._phoneList = [...data];

		// Map favorites by opaque id
		state._phoneList = state._phoneList.map((p) => {
			p.isFav = state.favorites.some((f) => f && f.id && p.id && f.id === p.id);
			return p;
		});

		filterList();
		redraw();
	}

/**
 * Filters the phone list by active favorites menu. Record visibility for non-admin is enforced by the API.
 * Updates state.phoneList from state._phoneList.
 */
const filterList = () => {
	state.phoneList = state._phoneList.filter((p) => {
		// Filter by favorites menu if active
		if (state.activeMenu === "favorites" && !p.isFav) return false;
		return true;
	});
};

/**
 * Global app state: phone list, favorites, auth tokens, and API helpers.
 * @type {Object}
 */
const state = {
	_phoneList: [],
	init,
	phoneList: [],
	favorites: [],
	activeMenu: false,
	loadPhonelist,
	loadFavorites,
	filterList,
	addFavorite,
	removeFavorite,
	getToken,
	getRefreshToken,
	saveToken,
	saveTokens,
	clearToken,
	requestWithAuth,
	log,
	tokenKey,
	refreshTokenKey,
	menuKey,
};

export default state;
