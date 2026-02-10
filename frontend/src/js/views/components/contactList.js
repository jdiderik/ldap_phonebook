import m, { route } from "mithril";
import state from "../../lib/state";
import { app } from "../../..";
import { openUserDetails } from "./userDetailsModal";
import { openLoginModal } from "./loginModal";

/**
 * Adds only favorites state to API list rows. Display fields come from the API. Favorites matched by opaque id.
 * @param {Object[]} users - User objects from the API (include id, fullName, location, phone, mobile, email).
 * @returns {Object[]} Same users with _isFavorite set when authenticated.
 */
const addFavoritesToUserData = (users) => {
	return users.map((user) => ({
		...user,
		_isFavorite: !!(app.auth && state.favorites.some((f) => f && f.id && user.id && f.id === user.id)),
	}));
};

// Sorting state
let sortColumn = "fullName"; // Default sort column (from API)
let sortDirection = "asc"; // "asc" or "desc"

// Search state
let searchQuery = "";
let debounceTimer = null;
const DEBOUNCE_DELAY = 300; // milliseconds

// Favorites filter state
let showFavoritesOnly = false;

// Group filter state (empty = all groups)
let selectedGroupFilter = "";

// UAC (userAccountControl) filter state (empty = all UAC)
let selectedUacFilter = "";

// Build unique sorted list of group names from user list
const getUniqueGroups = (users) => {
	const set = new Set();
	for (const user of users) {
		const names = user.groups?.names;
		if (Array.isArray(names)) {
			for (const name of names) {
				if (name != null && String(name).trim() !== "") set.add(String(name).trim());
			}
		}
	}
	return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

// Build unique sorted list of UAC display strings from user list (uacDescription or (value) or "—")
const getUniqueUacOptions = (users) => {
	const set = new Set();
	for (const user of users) {
		const label = user.uacDescription || (user.uac != null ? `(${user.uac})` : "—");
		set.add(label);
	}
	return [...set].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: "base" }));
};

// Sort data based on current sort column and direction
const sortData = (data) => {
	if (!sortColumn) return data;
	
	const sorted = [...data].sort((a, b) => {
		let aVal = a[sortColumn] || "";
		let bVal = b[sortColumn] || "";
		
		// Convert to strings for comparison
		aVal = String(aVal).toLowerCase();
		bVal = String(bVal).toLowerCase();
		
		if (aVal < bVal) return sortDirection === "asc" ? -1 : 1;
		if (aVal > bVal) return sortDirection === "asc" ? 1 : -1;
		return 0;
	});
	
	return sorted;
};

// Handle column header click for sorting
const handleSort = (column) => {
	if (sortColumn === column) {
		// Toggle direction if clicking the same column
		sortDirection = sortDirection === "asc" ? "desc" : "asc";
	} else {
		// New column, default to ascending
		sortColumn = column;
		sortDirection = "asc";
	}
	m.redraw();
};

// Get sort indicator for column header
const getSortIndicator = (column) => {
	if (sortColumn !== column) return "";
	return sortDirection === "asc" ? " ▲" : " ▼";
};

// Filter data based on search query, favorites filter, and group filter
const filterData = (data) => {
	let filtered = data;
	
	// Apply favorites filter first
	if (showFavoritesOnly) {
		filtered = filtered.filter((user) => user._isFavorite === true);
	}
	
	// Apply group filter
	if (app.isAdmin && selectedGroupFilter) {
		filtered = filtered.filter((user) => {
			const names = user.groups?.names;
			if (!Array.isArray(names)) return false;
			return names.some((n) => n != null && String(n).trim() === selectedGroupFilter);
		});
	}

	// Apply UAC (userAccountControl) filter
	if (app.isAdmin && selectedUacFilter) {
		filtered = filtered.filter((user) => {
			const label = user.uacDescription || (user.uac != null ? `(${user.uac})` : "—");
			return label === selectedUacFilter;
		});
	}
	
	// Apply search filter (uses API display fields: fullName, location, phone, mobile, email)
	if (searchQuery && searchQuery.trim() !== "") {
		const searchTerms = searchQuery.trim().toLowerCase().split(/\s+/).filter((term) => term.length > 0);
		if (searchTerms.length > 0) {
			filtered = filtered.filter((user) => {
				const searchableText = [
					user.fullName || "",
					user.title || "",
					user.department || "",
					user.office || "",
					user.location || "",
					user.phone || "",
					user.mobile || "",
					user.email || "",
				]
					.map((val) => String(val).toLowerCase())
					.join(" ");
				return searchTerms.every((term) => searchableText.includes(term));
			});
		}
	}
	
	return filtered;
};

// Handle search input with debounce
const handleSearchInput = (value) => {
	searchQuery = value;
	
	// Clear existing timer
	if (debounceTimer) {
		clearTimeout(debounceTimer);
	}
	
	// Set new timer for debounce
	debounceTimer = setTimeout(() => {
		m.redraw();
	}, DEBOUNCE_DELAY);
	
	// Immediate redraw for better UX (debounce is just for performance)
	m.redraw();
};

// Clear search, group filter, and UAC filter
const clearSearch = () => {
	searchQuery = "";
	if (app.isAdmin) {
		selectedGroupFilter = "";
		selectedUacFilter = "";
	}
	if (debounceTimer) {
		clearTimeout(debounceTimer);
		debounceTimer = null;
	}
	m.redraw();
};

// Toggle favorite status for a user (uses opaque id; no dn exposed to non-admin)
const toggleFavorite = async (user) => {
	if (!user.id) {
		console.error("toggleFavorite: user has no id", user);
		return;
	}
	const isCurrentlyFavorite = user._isFavorite;
	try {
		if (isCurrentlyFavorite) {
			await state.removeFavorite({ id: user.id });
		} else {
			await state.addFavorite({ id: user.id, displayName: user.fullName || "" });
		}
		await state.loadFavorites();
		const userInState = state._phoneList.find((u) => u.id === user.id);
		if (userInState) userInState.isFav = !isCurrentlyFavorite;
		user._isFavorite = !isCurrentlyFavorite;
		m.redraw();
	} catch (error) {
		console.error("Error toggling favorite:", error);
	}
};

/**
 * Contact list view: table with search, filters, favorites, and sortable columns.
 * Loads phone list and favorites on init; uses state.phoneList and state.favorites.
 */
const contactList = {
	oninit: async () => {
		await state.loadFavorites();
		await state.loadPhonelist();
		m.redraw();
	},
	
	view: () => {
		if (!state.phoneList.length) {
			return m("div.loading", { style: { padding: "20px", textAlign: "center" } }, "Loading...");
		}
		
		// Add favorites (API already provides fullName, location, phone, mobile, email)
		const transformedData = addFavoritesToUserData(state.phoneList);
		const uniqueGroups = app.isAdmin ? getUniqueGroups(transformedData) : [];
		const uniqueUacOptions = app.isAdmin ? getUniqueUacOptions(transformedData) : [];
		const filteredData = filterData(transformedData);
		const sortedData = sortData(filteredData);
		
		return m("div.contact-table-container", {
			style: {
				width: "100%",
				height: "100%",
				display: "flex",
				flexDirection: "column",
			},
		}, [
			// Search box and filters
			m("div.search-box-container", {
				style: {
					padding: "1rem",
					background: "#f5f5f5",
					borderBottom: "1px solid #ddd",
					display: "flex",
					alignItems: "center",
					gap: "1rem",
					flexWrap: "wrap",
				},
			}, [
				m("input.search-input", {
					type: "text",
					placeholder: "Search contacts...",
					value: searchQuery,
					oninput: (e) => handleSearchInput(e.target.value),
					onkeydown: (e) => {
						// Clear search on Escape key
						if (e.key === "Escape") {
							e.preventDefault();
							clearSearch();
							// Blur the input to remove focus
							e.target.blur();
						}
					},
					style: {
						flex: 1,
						minWidth: "200px",
						maxWidth: "500px",
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						outline: "none",
					},
					onfocus: (e) => {
						e.target.style.borderColor = "#0066cc";
					},
					onblur: (e) => {
						e.target.style.borderColor = "#ddd";
					},
				}),
				app.isAdmin && m("select.group-filter-select", {
					style: {
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						background: "#fff",
						minWidth: "180px",
						outline: "none",
					},
					value: selectedGroupFilter,
					onchange: (e) => {
						selectedGroupFilter = e.target.value || "";
						m.redraw();
					},
				}, [
					m("option", { value: "" }, "All groups"),
					...uniqueGroups.map((name) => m("option", { value: name, id: name }, name)),
				]),
				app.isAdmin && m("select.uac-filter-select", {
					style: {
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						background: "#fff",
						minWidth: "180px",
						outline: "none",
					},
					value: selectedUacFilter,
					onchange: (e) => {
						selectedUacFilter = e.target.value || "";
						m.redraw();
					},
				}, [
					m("option", { value: "" }, "All UAC"),
					...uniqueUacOptions.map((label) => m("option", { value: label, id: label }, label)),
				]),
				(searchQuery || selectedGroupFilter || selectedUacFilter) && m("button.clear-search-btn", {
					style: {
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						background: "#fff",
						color: "#666",
						cursor: "pointer",
						outline: "none",
						display: "flex",
						alignItems: "center",
						justifyContent: "center",
					},
					onclick: () => {
						clearSearch();
					},
					onmouseenter: (e) => {
						e.target.style.background = "#f0f0f0";
					},
					onmouseleave: (e) => {
						e.target.style.background = "#fff";
					},
				}, "✕ Clear"),
				app.auth && m("button.favorites-toggle-btn", {
					style: {
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						background: showFavoritesOnly ? "#0066cc" : "#fff",
						color: showFavoritesOnly ? "#fff" : "#333",
						cursor: "pointer",
						outline: "none",
					},
					onclick: () => {
						showFavoritesOnly = !showFavoritesOnly;
						m.redraw();
					},
				}, showFavoritesOnly ? "⭐ Show All" : "⭐ Show Favorites Only"),
				app.isAdmin && m("button.admin-btn", {
					style: {
						padding: "0.5rem 1rem",
						fontSize: "14px",
						border: "1px solid #ddd",
						borderRadius: "4px",
						background: "#fff",
						color: "#333",
						cursor: "pointer",
						outline: "none",
					},
					title: "Admin",
					onclick: () => route.set("/admin"),
				}, "Admin"),
				app.auth
					? m("button.logout-btn", {
						style: {
							padding: "0.5rem 1rem",
							fontSize: "14px",
							border: "1px solid #ddd",
							borderRadius: "4px",
							background: "#fff",
							color: "#333",
							cursor: "pointer",
							outline: "none",
							marginLeft: "auto",
						},
						title: "Logout",
						onclick: () => {
							state.clearToken();
							app.auth = false;
							app.isAdmin = false;
							state.favorites = [];
							state.filterList();
							m.redraw();
						},
					}, "Logout")
					: m("button.login-key-btn", {
						style: {
							padding: "0.5rem 1rem",
							fontSize: "14px",
							border: "1px solid #ddd",
							borderRadius: "4px",
							background: "#fff",
							color: "#333",
							cursor: "pointer",
							outline: "none",
							marginLeft: "auto",
						},
						title: "Login",
						onclick: openLoginModal,
					}, "🔑"),
				(searchQuery || showFavoritesOnly || selectedGroupFilter || selectedUacFilter) && m("span.search-results", {
					style: {
						color: "#666",
						fontSize: "14px",
						whiteSpace: "nowrap",
					},
				}, `${sortedData.length} of ${transformedData.length} contacts`),
			]),
			// Table container with scroll
			m("div.table-scroll-container", {
				style: {
					flex: 1,
					overflow: "auto",
				},
			}, [
			m("table.contact-table", {
				style: {
					width: "100%",
					borderCollapse: "collapse",
				},
			}, [
				m("thead", [
					m("tr", [
						app.auth && m("th.col-favorite", {
							style: { width: "50px", textAlign: "center", cursor: "default" },
						}, "⭐"),
						m("th.sortable.col-name", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("fullName"),
						}, "Name" + getSortIndicator("fullName")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("title"),
						}, "Title" + getSortIndicator("title")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("department"),
						}, "Department" + getSortIndicator("department")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("office"),
						}, "Office" + getSortIndicator("office")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("location"),
						}, "Location" + getSortIndicator("location")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("phone"),
						}, "Phone" + getSortIndicator("phone")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("mobile"),
						}, "Mobile" + getSortIndicator("mobile")),
						m("th.sortable", {
							style: { cursor: "pointer", userSelect: "none" },
							onclick: () => handleSort("email"),
						}, "Email" + getSortIndicator("email")),
						app.isAdmin && m("th", { style: { cursor: "default" } }, "Details"),
					]),
				]),
				m("tbody", 
					sortedData.map((user) => {
						return m("tr", {
							key: user.id || user.fullName,
						}, [
							...(app.auth ? [
								m("td.col-favorite", {
									style: { textAlign: "center", padding: "0.5rem" },
								}, [
									m("input[type=checkbox]", {
										checked: user._isFavorite || false,
										onchange: (e) => {
											e.stopPropagation();
											toggleFavorite(user);
										},
										style: { cursor: "pointer", width: "18px", height: "18px" },
									}),
								]),
							] : []),
							m("td.col-name", user.fullName || ""),
							m("td", user.title || ""),
							m("td", user.department || ""),
							m("td", user.office || ""),
							m("td", user.location || ""),
							m("td", 
								user.phone 
									? m("a", { 
										href: `tel:${user.phone}`, 
										style: { color: "#0066cc", textDecoration: "none" },
										onclick: (e) => e.stopPropagation(),
									}, user.phone)
									: ""
							),
							m("td", 
								user.mobile 
									? m("a", { 
										href: `tel:${user.mobile}`, 
										style: { color: "#0066cc", textDecoration: "none" },
										onclick: (e) => e.stopPropagation(),
									}, user.mobile)
									: ""
							),
							m("td", 
								user.email 
									? m("a", { 
										href: `mailto:${user.email}`, 
										style: { color: "#0066cc", textDecoration: "none" },
										onclick: (e) => e.stopPropagation(),
									}, user.email)
									: (user.email || "")
							),
							...(app.isAdmin ? [
								m("td", 
									m("button.details-btn", {
										style: {
											padding: "4px 8px",
											cursor: "pointer",
											border: "1px solid #ddd",
											background: "#f5f5f5",
											borderRadius: "3px",
										},
										onclick: (e) => {
											e.preventDefault();
											e.stopPropagation();
											openUserDetails(user);
										},
									}, "👁️")
								),
							] : []),
						]);
					})
				),
			]),
			]),
		]);
	},
};

export default contactList;
