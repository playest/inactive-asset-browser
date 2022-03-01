import { SceneDataSchema } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/sceneData";

// Set this variables as their initilized state, see doc of LenientGlobalVariableTypes for an explanation
declare global {
    interface LenientGlobalVariableTypes {
        game: never;
        socket: never;
        ui: never;
        canvas: never;
    }
}

interface Asset {

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

const cache: Asset[] = [];

async function showMainWindow() {
    const rendered_html = await renderTemplate(joinPath(PATH_TO_ROOT_OF_MODULE, "templates/assetList.html"), { assets: cache });
    let d = new Dialog({
        title: "List of Assets",
        content: rendered_html,
        buttons: {
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
                            const o = JSON.parse(line) as SceneDataSchema;
                            console.log(o);
                            cache.push(o);
                        }
                    }
                }
            }
        }
    }
    showMainWindow();
});
