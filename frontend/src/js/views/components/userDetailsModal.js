import { Button, Dialog, Icon, Icons } from "construct-ui";
import m from "mithril";

let selectedUser = null;
let isOpen = false;

/**
 * Opens the user details modal for the given user.
 * @param {Object} user - User/contact object from the phone list.
 */
export const openUserDetails = (user) => {
	selectedUser = user;
	isOpen = true;
	m.redraw();
};

/** Closes the user details modal and clears the selected user. */
export const closeUserDetails = () => {
	isOpen = false;
	selectedUser = null;
};

/**
 * Formats LDAP-style timestamps (e.g. 20260128042514.0Z) as YYYY-MM-DD HH:mm:ss.
 * @param {*} value - Raw value (string or array of strings).
 * @returns {string} Formatted date string or "".
 */
const formatTimestamp = (value) => {
	if (value === null || value === undefined) return "";
	const str = Array.isArray(value) ? value[0] : value;
	if (typeof str !== "string") return "";
	const match = str.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
	if (!match) return str;
	return `${match[1]}-${match[2]}-${match[3]} ${match[4]}:${match[5]}:${match[6]}`;
};

/**
 * Formats a value for display in the details table (handles arrays, objects, primitives).
 * @param {*} value - Raw value from user object.
 * @returns {string} Display string or "".
 */
const formatValue = (value) => {
	if (value === null || value === undefined) return "";
	if (typeof value === "object") {
		if (Array.isArray(value)) {
			return value.length > 0 ? value.join(", ") : "";
		}
		return JSON.stringify(value, null, 2);
	}
	return String(value);
};

const renderField = (label, value) => {
	const formatted = formatValue(value);
	if (!formatted) return null;
	return m("tr", [
		m("td.field-label", label),
		m("td.field-value", formatted),
	]);
};

// Render groups (names array) as a clear list
const renderGroups = (groups) => {
	if (!groups) return null;
	const names = Array.isArray(groups.names)
		? groups.names
		: groups.names && typeof groups.names === "object" && !Array.isArray(groups.names)
			? Object.values(groups.names).filter(Boolean)
			: Array.isArray(groups)
				? groups
				: [];
	if (names.length === 0) return null;
	const listItems = names.map((name) => m("li", { id: String(name) }, name));
	return m("tr", [
		m("td.field-label", "Groups"),
		m("td.field-value", m("ul.groups-list", { style: { margin: 0, paddingLeft: "1.25rem" } }, listItems)),
	]);
};

const userDetailsModal = {
	view: () => {
		if (!isOpen || !selectedUser) return null;

		return m(Dialog, {
			isOpen,
			hasCloseButton: true,
			onClose: closeUserDetails,
			content: [
				m("div.user-details-modal-content", [
				m("h2", "User Details"),
				m(
					"table.user-details-table",
					{
						style: {
							width: "100%",
							borderCollapse: "collapse",
							marginTop: "1rem",
						},
					},
					[
						renderField("Display Name", selectedUser.displayName),
						renderField("First Name", selectedUser.firstName),
						renderField("Last Name", selectedUser.lastName),
						renderField("Title", selectedUser.title),
						renderField("Department", selectedUser.department),
						renderField("Company", selectedUser.company),
						renderField("Office", selectedUser.office),
						renderField("Email", selectedUser.email),
						renderField("Account Name", selectedUser.accountName),
						renderField("UPN", selectedUser.upn),
						renderField("Business Phone", selectedUser.phones?.business),
						renderField("Mobile", selectedUser.phones?.mobile),
						renderField("IP Phone", selectedUser.phones?.ipPhone),
						renderField("City", selectedUser.location?.city),
						renderField("State", selectedUser.location?.state),
						renderField("Country", selectedUser.location?.country),
						renderField("Street", selectedUser.location?.street),
						renderField("Postal Code", selectedUser.location?.postalCode),
						renderGroups(selectedUser.groups),
						renderField("Manager DN", selectedUser.managerDN),
						renderField("Last Modified", formatTimestamp(selectedUser.whenChanged) || null),
						renderField("Created", formatTimestamp(selectedUser.whenCreated) || null),
						renderField("Last Logon", selectedUser.lastLogon),
						renderField("Last Logon (replicated)", selectedUser.lastLogonTimestamp),
						renderField("Password Last Set", selectedUser.passwordLastSet),
						renderField("UAC", selectedUser.uac),
						renderField("UAC Description", selectedUser.uacDescription),
						renderField("DN", selectedUser.dn),
						renderField("GUID", selectedUser.guid),
						renderField("Synced At", selectedUser.syncedAt),
						renderField("Manual Contact", selectedUser.isManual ? "Yes" : "No"),
					]
				),
				m("pre.json-view", {
					style: {
						marginTop: "1rem",
						padding: "1rem",
						backgroundColor: "#f5f5f5",
						borderRadius: "4px",
						overflow: "auto",
						maxHeight: "400px",
						fontSize: "12px",
					},
				}, JSON.stringify(selectedUser, null, 2)),
				]),
			],
		});
	},
};

export default userDetailsModal;
