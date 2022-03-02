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
    assetCollection: {
        [moduleName: string]: {
            title: string,
            onePack: boolean,
            packs: {
                [packName: string]: {
                    title: string,
                    assets: Asset[],
                }
            }
        }
    }
}

const MODULE_NAME = "inactive-asset-browser";
const PATH_TO_ROOT_OF_MODULE = `modules/${MODULE_NAME}/`;
function joinPath(...paths: string[]) {
    return paths.join("/");
}

Hooks.once('init', async function() {

});

function isOfInterest(moduleName: string): boolean {
    return ["mikwewa-maps-free", "milbys-maps-free", "tomcartos-maps-megapack"].includes(moduleName);
}

class App extends FormApplication<FormApplicationOptions, AppData, {}> {
    constructor(private data: AppData) {
        super({}, { resizable: true, scrollY: [".module-list"], width: 500, height: Math.round(window.innerHeight / 2) });
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

        win.querySelectorAll<HTMLElement>(".asset").forEach(asset => asset.addEventListener("click", async (e) => {
            console.log("asset click", e, asset);
            win.querySelector(".panel .asset-view")!.innerHTML = `${asset.dataset.moduleName}.${asset.dataset.packName}/${asset.dataset.assetName}`
        }));
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
        console.log("module", module);
        if(isOfInterest(name)) {
            let packsInModule = assetCollection[module.id];
            if(packsInModule === undefined) {
                packsInModule = {title: module.data.title, packs: {}, onePack: false}; // onePack set to false for now
                assetCollection[module.id] = packsInModule;
            }
            let packCount = 0;
            for(const pack of module.packs) {
                if(packCount > 3) { // TODO remove before putting into prod, this is just for faster testing
                    break;
                }
                if(pack.type == "Scene") {
                    console.log("pack", pack);
                    let assetsInPack = packsInModule.packs[pack.name];
                    if(assetsInPack === undefined) {
                        assetsInPack = {title: pack.label, assets: []};
                        packsInModule.packs[pack.name] = assetsInPack;
                    }
                    const url = "modules/" + module.id + "/" + pack.path;
                    const r = await fetch(url);
                    const text = await r.text();
                    const lines = text.split(/\r?\n/);
                    let assetCount = 0;
                    for(const line of lines) {
                        if(line !== "") {
                            if(assetCount >= 5) { // TODO remove before putting into prod, this is just for faster testing
                                break;
                            }
                            const o = JSON.parse(line) as SceneDataProperties;
                            if(o.name !== '#[CF_tempEntity]') {
                                assetsInPack.assets.push({
                                    name: o.name,
                                    img: o.img,
                                    thumb: o.thumb
                                });
                                assetCount++;
                            }
                        }
                    }
                    packCount++;
                }
            }
            packsInModule.onePack = packCount == 1;
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
