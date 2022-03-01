// Set this variables as their initilized state, see doc of LenientGlobalVariableTypes for an explanation
interface LenientGlobalVariableTypes {
    game: never;
    socket: never;
    ui: never;
    canvas: never;
}

const MODULE_NAME = "inactive-asset-browser";
const PATH_TO_ROOT_OF_MODULE = `modules/${MODULE_NAME}/`;
function joinPath(...paths: string[]) {
    return paths.join("/");
}

Hooks.once('init', async function() {

});

function isOfInterest(moduleName: string): boolean {
    return ["czepeku-maps-megapack"].includes(moduleName);
}

async function showMainWindow() {
    const rendered_html = await renderTemplate(joinPath(PATH_TO_ROOT_OF_MODULE, "templates/assetList.html"), {});
    let d = new Dialog({
        title: "MyDialogTitle",
        content: rendered_html,
        buttons: {
            toggle: {
                icon: '<i class="fas fa-check"></i>',
                label: "Okay",
                callback: () => console.log("Okay")
            },
        },
        default: "toggle",
        close: html => {
            console.log(html);
        },
      });
    d.render(true);
}

Hooks.once('ready', async function() {
    console.log("inactive-asset-browser started");
    let i = 0;
    for(const [name, module] of game.modules.entries()) {
        if(isOfInterest(name)) {
            for(const pack of module.packs.slice(0, 3)) { // TODO this slice is just for quick testing
                if(pack.type == "Scene") {
                    //console.log(pack.absPath);
                    const url = "modules/" + module.id + "/" + pack.path;
                    console.log(url);
                    const r = await fetch(url);
                    const text = await r.text();
                    const lines = text.split(/\r?\n/);
                    console.log("lines", lines.length);
                    for(const line of lines) {
                        if(line !== "") {
                            const o = JSON.parse(line);
                            console.log(o);
                        }
                    }
                }
            }
        }
        // TODO this is just for quick testing
        if(i > 10) {
            break;
        }
        i++;
    }
    showMainWindow();
});
