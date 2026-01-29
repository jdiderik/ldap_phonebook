import { Button, Callout, Dialog, Form, FormGroup, FormLabel, Icon, Icons, Input } from "construct-ui";
import m, { redraw, request, route } from "mithril";
import { app } from "../..";
import state from "../lib/state";

let username = "";
let password = "";
let error = "";
let showPassword = false;
let isValid = false;
let loading = false;

const validate = () => {
	isValid = Boolean(username && username.length > 0 && password && password.length > 0);
};

const login = async () => {
	try {
		error = "";
		loading = true;
		redraw();

		const body = {
			username,
			password,
		};

		const loginResult = await request({
			method: "POST",
			url: app.root + "/login",
			body,
		});

		state.log("login", loginResult);
		loading = false;

		if (loginResult.error) {
			error = loginResult.error || "Login failed";
			redraw();
		} else {
			if (loginResult.accessToken && loginResult.refreshToken) {
				state.saveTokens(loginResult.accessToken, loginResult.refreshToken);
			} else if (loginResult.token) {
				state.saveToken(loginResult.token);
			}
			app.auth = true;
			app.isAdmin = !!loginResult.user?.isAdmin;
			state.filterList();
			route.set("/home", {}, { replace: true });
		}
	} catch (err) {
		console.log(err);
		loading = false;
		state.log("catch login error", err);
		isValid = false;
		password = "";
		error = "Login failed (unexpected error)";
		redraw();
	}
};

export const vwLogin = {
	view: () =>
		m(Dialog, {
			autofocus: true,
			inline: true,
			isOpen: true,
			class: "login",
			hasCloseButton: true,
			closeOnEscapeKey: true,
			closeOnOutsideClick: true,

			content: [
				m("h1", "LDAP Login"),
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
										validate();
									},
									onkeyup: (ev) => {
										if (ev.key === "Enter" && isValid) {
											login();
										}
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
										},
									}),
									oninput: (ev) => {
										password = ev.currentTarget.value;
										validate();
									},
									onkeyup: (ev) => {
										if (ev.key === "Enter" && isValid) {
											login();
										}
									},
									value: password,
								}),
							],
						}),
						m(Button, {
							label: "LOGIN",
							disabled: !isValid,
							intent: isValid ? "positive" : "none",
							loading: loading,
							onclick: () => {
								if (isValid) {
									login();
								}
							},
						}),
						error
							? m(Callout, {
									intent: "negative",
									content: error,
							  })
							: void 0,
					]
				),
			],
		}),
};
