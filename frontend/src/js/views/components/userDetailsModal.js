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
						renderField("Last Modified", selectedUser.whenChanged),
						renderField("Created", selectedUser.whenCreated),
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
