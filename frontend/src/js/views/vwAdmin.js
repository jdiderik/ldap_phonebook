import m, { route } from "mithril";
import { Tabs, TabItem } from "construct-ui";
import { app } from "../..";
import state from "../lib/state";

let activeTab = "sync-log";
let syncLogFiles = [];
let selectedLogName = null;
let selectedLogContent = null;
let settings = {};
let loadingSyncLogs = false;
let loadingSettings = false;
let loadingLogContent = false;
let error = null;

const loadSyncLogs = async () => {
	loadingSyncLogs = true;
	error = null;
	m.redraw();
	try {
		const result = await state.requestWithAuth({
			url: app.root + "/admin/sync-logs",
			timeout: 5000,
		});
		syncLogFiles = (result && result.files) || [];
		selectedLogName = null;
		selectedLogContent = null;
	} catch (err) {
		error = err.message || "Failed to load sync logs";
		syncLogFiles = [];
	} finally {
		loadingSyncLogs = false;
		m.redraw();
	}
};

/**
 * Parses pino JSON log lines into table rows for the admin sync log view.
 * @param {string} [content] - Raw log file content (one JSON object per line).
 * @returns {{ datetime: string, timeSpent: string, message: string }[]}
 */
function parseLogContent(content) {
	if (!content || typeof content !== "string") return [];
	const lines = content.trim().split("\n");
	return lines.map((line) => {
		const trimmed = line.trim();
		if (!trimmed) return { datetime: "", timeSpent: "", message: "" };
		try {
			const o = JSON.parse(trimmed);
			const datetime = o.time != null ? new Date(o.time).toLocaleString() : "";
			const timeSpent =
				o.elapsedMs != null
					? o.elapsedMs + " ms"
					: o.processingMs != null
						? o.processingMs + " ms"
						: o.searchMs != null
							? o.searchMs + " ms"
							: o.deleteMs != null
								? o.deleteMs + " ms"
								: o.totalMs != null
									? o.totalMs + " ms"
									: "";
			const message = o.msg != null ? String(o.msg) : "";
			return { datetime, timeSpent, message };
		} catch {
			return { datetime: "", timeSpent: "", message: trimmed };
		}
	});
}

const loadLogContent = async (filename) => {
	selectedLogName = filename;
	loadingLogContent = true;
	selectedLogContent = null;
	m.redraw();
	try {
		const result = await state.requestWithAuth({
			url: app.root + "/admin/sync-logs/" + encodeURIComponent(filename),
			timeout: 5000,
		});
		selectedLogContent = (result && result.content) || "";
	} catch (err) {
		selectedLogContent = "Error: " + (err.message || "Failed to load log");
	} finally {
		loadingLogContent = false;
		m.redraw();
	}
};

const loadSettings = async () => {
	loadingSettings = true;
	error = null;
	m.redraw();
	try {
		const result = await state.requestWithAuth({
			url: app.root + "/admin/settings",
			timeout: 5000,
		});
		settings = (result && result.settings) || {};
	} catch (err) {
		error = err.message || "Failed to load settings";
		settings = {};
	} finally {
		loadingSettings = false;
		m.redraw();
	}
};

export const vwAdmin = {
	oninit: () => {
		activeTab = "sync-log";
		loadSyncLogs();
	},

	view: () => {
		if (!app.isAdmin) {
			return m("div", { style: { padding: "1rem" } }, "Access denied.");
		}

		return m("div.admin-page", { style: { padding: "1rem", maxWidth: "900px", margin: "0 auto" } }, [
			m("div", { style: { marginBottom: "1rem" } }, [
				m("a", {
					href: "/home",
					onclick: (e) => {
						e.preventDefault();
						route.set("/home");
					},
					style: { color: "#0066cc", textDecoration: "none" },
				}, "← Back to phonebook"),
			]),
			m("h1", "Admin"),
			m(
				Tabs,
				{ bordered: true, fluid: true },
				[
					m(TabItem, {
						label: "Sync log",
						active: activeTab === "sync-log",
						onclick: () => {
							activeTab = "sync-log";
							if (syncLogFiles.length === 0 && !loadingSyncLogs) loadSyncLogs();
							m.redraw();
						},
					}),
					m(TabItem, {
						label: "Settings",
						active: activeTab === "settings",
						onclick: () => {
							activeTab = "settings";
							if (Object.keys(settings).length === 0 && !loadingSettings) loadSettings();
							m.redraw();
						},
					}),
				]
			),
			activeTab === "sync-log" &&
				m(
					"div.sync-log-tab",
					{ style: { marginTop: "1rem" } },
					[
						error && m("p", { style: { color: "#c00" } }, error),
						loadingSyncLogs && m("p", "Loading sync logs..."),
						!loadingSyncLogs &&
							syncLogFiles.length === 0 &&
							!error &&
							m("p", "No sync log files yet. Run a sync to create one."),
						!loadingSyncLogs &&
							syncLogFiles.length > 0 &&
							m(
								"div",
								{ style: { display: "flex", gap: "1rem", marginTop: "0.5rem" } },
								[
									m(
										"div",
										{ style: { flex: "0 0 220px" } },
										m(
											"ul",
											{
												style: {
													listStyle: "none",
													padding: 0,
													margin: 0,
													border: "1px solid #ddd",
													borderRadius: "4px",
													overflow: "hidden",
												},
											},
											syncLogFiles.map((f) =>
												m(
													"li",
													{
														style: {
															padding: "0.5rem 0.75rem",
															cursor: "pointer",
															background: selectedLogName === f.name ? "#e0e0e0" : "#fff",
															borderBottom: "1px solid #eee",
														},
														onclick: () => loadLogContent(f.name),
													},
													[f.name, f.mtime ? " " + f.mtime.slice(0, 19) : ""]
												)
											)
										)
									),
									m("div", { style: { flex: 1, minWidth: 0 } }, [
										loadingLogContent && m("p", "Loading..."),
										selectedLogContent !== null &&
											!loadingLogContent &&
											(typeof selectedLogContent === "string" && selectedLogContent.startsWith("Error:")
												? m("p", { style: { color: "#c00" } }, selectedLogContent)
												: (() => {
													const rows = parseLogContent(selectedLogContent);
													return m(
														"div",
														{ style: { overflow: "auto", maxHeight: "60vh", border: "1px solid #ddd", borderRadius: "4px" } },
														m("table.admin-log-table", {
															style: {
																width: "100%",
																borderCollapse: "collapse",
																fontSize: "13px",
															},
														}, [
															m("thead", [
																m("tr", [
																	m("th", { style: { padding: "0.5rem 0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", background: "#f5f5f5", whiteSpace: "nowrap" } }, "Datetime"),
																	m("th", { style: { padding: "0.5rem 0.75rem", textAlign: "right", borderBottom: "2px solid #ddd", background: "#f5f5f5", whiteSpace: "nowrap" } }, "Time spent"),
																	m("th", { style: { padding: "0.5rem 0.75rem", textAlign: "left", borderBottom: "2px solid #ddd", background: "#f5f5f5" } }, "Message"),
																]),
															]),
															m("tbody",
																rows.map((row, i) =>
																	m("tr", { key: i, style: { borderBottom: "1px solid #eee" } }, [
																		m("td", { style: { padding: "0.5rem 0.75rem", whiteSpace: "nowrap" } }, row.datetime),
																		m("td", { style: { padding: "0.5rem 0.75rem", textAlign: "right", whiteSpace: "nowrap" } }, row.timeSpent),
																		m("td", { style: { padding: "0.5rem 0.75rem", wordBreak: "break-word" } }, row.message),
																	])
																)
															),
														])
													);
												})()),
										!selectedLogName && !loadingLogContent && m("p", { style: { color: "#666" } }, "Select a log file"),
									]),
								]
							),
					]
				),
			activeTab === "settings" &&
				m(
					"div.settings-tab",
					{ style: { marginTop: "1rem" } },
					[
						error && m("p", { style: { color: "#c00" } }, error),
						loadingSettings && m("p", "Loading settings..."),
						!loadingSettings &&
							Object.keys(settings).length > 0 &&
							m(
								"table",
								{
									style: {
										width: "100%",
										borderCollapse: "collapse",
										border: "1px solid #ddd",
										fontSize: "14px",
									},
								},
								[
									m("thead", [
										m("tr", [
											m("th", { style: { padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #ddd" } }, "Key"),
											m("th", { style: { padding: "0.5rem", textAlign: "left", borderBottom: "2px solid #ddd" } }, "Value"),
										]),
									]),
									m(
										"tbody",
										Object.entries(settings).map(([key, value]) =>
											m("tr", { key }, [
												m("td", { style: { padding: "0.5rem", borderBottom: "1px solid #eee" } }, key),
												m("td", { style: { padding: "0.5rem", borderBottom: "1px solid #eee", wordBreak: "break-all" } }, String(value)),
											])
										)
									),
								]
							),
					]
				),
		]);
	},
};
