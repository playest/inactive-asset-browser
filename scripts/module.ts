import { SceneDataProperties } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/sceneData";

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
    name: string,
    img: string | null | undefined, // we should probably exclude those without image
    thumb: string | null | undefined,
}

interface AppData {
    assetCollection: { [moduleName: string]: Asset[] }
}

const MODULE_NAME = "inactive-asset-browser";
const PATH_TO_ROOT_OF_MODULE = `modules/${MODULE_NAME}/`;
function joinPath(...paths: string[]) {
    return paths.join("/");
}

Hooks.once('init', async function() {

});

function isOfInterest(moduleName: string): boolean {
    return ["mikwewa-maps-free", "milbys-maps-free"].includes(moduleName);
}

class App extends FormApplication<FormApplicationOptions, AppData, {}> {
    constructor(private data: AppData) {
        super({}, { resizable: true, width: 500, height: Math.round(window.innerHeight / 2) });
        console.log("creating window for", MODULE_NAME);
    }



    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: [],
            popOut: true,
            template: joinPath(PATH_TO_ROOT_OF_MODULE, "templates/assetList.html"),
            id: 'asset-list',
            title: 'List of Assets',
        });
    }

    getData() {
        // Send data to the template
        return this.data;
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        win.querySelector("button.re-index")!.addEventListener("click", async () => {
            console.log("Re-Index!!!");
            assetCollection = {};
            await indexAssets();
            this.render();
        });
    }

    async _updateObject(event: Event, formData: object) {
        console.log("_updateObject", formData);
    }
}

let assetCollection: AppData["assetCollection"] = {};

async function showMainWindow() {
    new App({ assetCollection }).render(true);
}

async function indexAssets() {
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
                            const o = JSON.parse(line) as SceneDataProperties;
                            if(o.name !== '#[CF_tempEntity]') {
                                console.log(o.img);
                                let assetsInModule = assetCollection[module.id];
                                if(assetsInModule === undefined) {
                                    assetsInModule = [];
                                    assetCollection[module.id] = assetsInModule;
                                }
                                assetsInModule.push({
                                    name: o.name,
                                    img: o.img,
                                    thumb: o.thumb
                                });
                            }
                        }
                    }
                }
            }
        }
        else {
            console.log("ignore module", name);
        }
    }
}

Hooks.once('ready', async function() {
    console.log("inactive-asset-browser started");
    await indexAssets();
    console.log("assetCollection", assetCollection);
    showMainWindow();
});
