import { ButtonGroup } from "construct-ui";
import m from "mithril";
import state from "../../lib/state";

const menuBar = {
    view: ({attrs}) => {
        // Menu bar is now empty - favorites functionality moved to contactList
        return m(ButtonGroup, {
            class: "menuBar",
            fluid: true,
        }, []);
    }
}

export default menuBar;