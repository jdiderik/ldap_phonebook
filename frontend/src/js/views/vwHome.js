import m from "mithril";
import menuBar from "./components/menuBar";
import contactList from "./components/contactList";
import logoBar from "./components/logoBar";
import userDetailsModal from "./components/userDetailsModal";
import loginModal from "./components/loginModal";
import state from "../lib/state";

/** Home view: logo, contact list table, bottom bar, and modals for details/login. */
export const vwHome = {
	oninit: async () => {
		state.activeMenu = localStorage.getItem(state.menuKey) || "all";
	},
	view: () => {
		return m(".home", [
			m(".logoBar", m(logoBar)),
			m(".content", m(contactList)),
			m(".bottomBar", m(menuBar)),
			m(userDetailsModal),
			m(loginModal),
		]);
	},
};

