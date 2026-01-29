import { Button, Callout, Dialog, Form, FormGroup, FormLabel, Icon, Icons, Input } from "construct-ui";
import m, { redraw, request } from "mithril";
import { app } from "../../..";
import state from "../../lib/state";

let isOpen = false;
let username = "";
let password = "";
let error = "";
let showPassword = false;
let loading = false;

const validate = () => Boolean(username && username.trim() && password && password.length > 0);

export const openLoginModal = () => {
	isOpen = true;
	username = "";
	password = "";
	error = "";
	showPassword = false;
	loading = false;
	m.redraw();
};

export const closeLoginModal = () => {
	isOpen = false;
	username = "";
	password = "";
	error = "";
	m.redraw();
};

const doLogin = async () => {
	if (!validate()) return;
	try {
		error = "";
		loading = true;
		redraw();

		const loginResult = await request({
			method: "POST",
			url: app.root + "/login",
			body: { username: username.trim(), password },
		});

		loading = false;

		if (loginResult.error) {
			error = loginResult.error || "Login failed";
			redraw();
			return;
		}

		if (loginResult.accessToken && loginResult.refreshToken) {
			state.saveTokens(loginResult.accessToken, loginResult.refreshToken);
		} else if (loginResult.token) {
			state.saveToken(loginResult.token);
		}
		app.auth = true;
		app.isAdmin = !!loginResult.user?.isAdmin;
		state.filterList();
		closeLoginModal();
		redraw();
	} catch (err) {
		loading = false;
		error = "Login failed (unexpected error)";
		redraw();
	}
};

const loginModal = {
	view: () => {
		if (!isOpen) return null;
		return m(Dialog, {
			autofocus: true,
			inline: true,
			isOpen: true,
			hasCloseButton: true,
			closeOnEscapeKey: true,
			closeOnOutsideClick: true,
			onClose: closeLoginModal,
			content: [
				m("h2", "Login"),
				m(
					Form,
					{
						align: "middle",
						justify: "space-between",
						element: "div",
						gutter: 10,
					},
					[
						m(FormGroup, {
							content: [
								m(FormLabel, "Username"),
								m(Input, {
									autofocus: true,
									basic: true,
									autocomplete: "username",
									fluid: true,
									disabled: loading,
									oninput: (ev) => {
										username = ev.currentTarget.value;
										redraw();
									},
									onkeyup: (ev) => {
										if (ev.key === "Enter" && validate()) doLogin();
									},
									value: username,
									required: true,
									size: "default",
								}),
							],
						}),
						m(FormGroup, {
							content: [
								m(FormLabel, "Password"),
								m(Input, {
									basic: true,
									disabled: loading,
									size: "xl",
									type: showPassword ? "text" : "password",
									required: true,
									autocomplete: "current-password",
									contentRight: m(Button, {
										tabindex: "-1",
										basic: true,
										outlined: false,
										label: m(Icon, {
											name: showPassword ? Icons.EYE_OFF : Icons.EYE,
										}),
										onclick: () => {
											showPassword = !showPassword;
											redraw();
										},
									}),
									oninput: (ev) => {
										password = ev.currentTarget.value;
										redraw();
									},
									onkeyup: (ev) => {
										if (ev.key === "Enter" && validate()) doLogin();
									},
									value: password,
								}),
							],
						}),
						m(Button, {
							label: "Login",
							disabled: !validate(),
							intent: validate() ? "positive" : "none",
							loading: loading,
							onclick: doLogin,
						}),
						error
							? m(Callout, {
									intent: "negative",
									content: error,
								})
							: null,
					]
				),
			],
		});
	},
};

export default loginModal;
