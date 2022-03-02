import { SceneDataProperties } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/sceneData";
import { ModuleData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/packages.mjs/moduleData";

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
    selectedModules: string[],
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

class AppDataClass implements AppData {
    selectedModules: string[] = [];
    assetCollection: {
        [moduleName: string]: {
            title: string;
            onePack: boolean;
            packs: {
                [packName: string]: {
                    title: string;
                    assets: Asset[];
                };
            };
        };
    } = {};

    addScene(moduleId: string, moduleTitle: string, packName: string, packTitle: string, asset: SceneDataProperties) {
        let module = this.assetCollection[moduleId];
        if(module === undefined) {
            module = { title: moduleTitle, onePack: false, packs: {} };
            this.assetCollection[moduleId] = module;
        }
        let packInModule = module.packs[packName];
        if(packInModule === undefined) {
            packInModule = { title: packTitle, assets: [] };
            module.packs[packName] = packInModule;
        }
        packInModule.assets.push({
            name: asset.name,
            img: asset.img,
            thumb: asset.thumb
        });
        module.onePack = Object.keys(module.packs).length == 1;
    }

    clearCache() {
        this.assetCollection = {};
    }
}

const appData = new AppDataClass();
appData.selectedModules = ["mikwewa-maps-free", "milbys-maps-free", "tomcartos-maps-megapack"];

const MODULE_NAME = "inactive-asset-browser";
const PATH_TO_ROOT_OF_MODULE = `modules/${MODULE_NAME}/`;
function joinPath(...paths: string[]) {
    return paths.join("/");
}

function log(message: unknown, ...otherMessages: unknown[]) {
    console.log(MODULE_NAME, "|", message, ...otherMessages);
}

Hooks.once('init', async function() {

});

function isOfInterest(moduleName: string): boolean {
    return ["mikwewa-maps-free", "milbys-maps-free", "tomcartos-maps-megapack"].includes(moduleName);
}

class App extends FormApplication<FormApplicationOptions, AppData, {}> {
    constructor(private data: AppData) {
        super({}, { resizable: true, scrollY: [".module-list"], width: 500, height: Math.round(window.innerHeight / 2) });
        log("creating window for", MODULE_NAME);
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
        return this.data;
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        win.querySelector(".re-index")!.addEventListener("click", async () => {
            log("Re-Index!!!");
            appData.clearCache();
            await indexAssets();
            this.render();
        });

        win.querySelector(".select-modules")!.addEventListener("click", () => showModuleSelectorWindow());

        win.querySelectorAll<HTMLElement>(".asset").forEach(asset => asset.addEventListener("click", async (e) => {
            log("asset click", e, asset);
            win.querySelector(".panel .asset-view")!.innerHTML = `${asset.dataset.moduleName}.${asset.dataset.packName}/${asset.dataset.assetName}`
        }));
    }

    async _updateObject(event: Event, formData: object) {
        log("_updateObject", formData);
    }
}

class ModuleSelector extends FormApplication<FormApplicationOptions, {existingModules: {[moduleName: string]: {module: Game.ModuleData<ModuleData>, selected: boolean}}}, AppData["selectedModules"]> {
    constructor(private existingModules: Game.ModuleData<ModuleData>[], private selectedModules: string[]) {
        super([], { resizable: true, scrollY: [".module-list"], width: 500, height: Math.round(window.innerHeight / 2) });
        log("creating ModuleSelector window for", MODULE_NAME);
    }

    static get defaultOptions() {
        return mergeObject(super.defaultOptions, {
            classes: [],
            popOut: true,
            template: joinPath(PATH_TO_ROOT_OF_MODULE, "templates/moduleSelector.html"),
            id: 'module-selector',
            title: 'Select Modules',
        });
    }

    getData() {
        const o: {[moduleName: string]: {module: Game.ModuleData<ModuleData>, selected: boolean}} = {};
        const sorted = Array.from(this.existingModules).sort((a, b) => a.data.title.localeCompare( b.data.title));
        for(const m of sorted) {
            o[m.id] = {module: m, selected: this.selectedModules.includes(m.id)};
        }
        return {existingModules: o};
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        function compareByTitle(a: Element, b: Element) {
            const titleA = a.querySelector(".title")!.innerHTML;
            const titleB = b.querySelector(".title")!.innerHTML;
            return titleA.localeCompare(titleB);
        }
        html[0].querySelector<HTMLElement>(".sort-selected")!.addEventListener("click", function() {
            log("sort selected");
            const moduleList = this.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
            Array.from(moduleList.children).sort((a, b) => {
                const inputA = a.querySelector<HTMLInputElement>("input")!;
                const inputB = b.querySelector<HTMLInputElement>("input")!;
                //log("compare", inputA, inputA.checked, inputB, inputB.checked);
                if(inputA.checked && !inputB.checked) {
                    //log("    ", 1);
                    return -1;
                }
                else if(!inputA.checked && inputB.checked) {
                    //log("    ", -1);
                    return 1;
                }
                else {
                    return compareByTitle(a, b);
                }
            }).forEach(node => moduleList.appendChild(node));
        });

        html[0].querySelector<HTMLElement>(".sort-alpha")!.addEventListener("click", function() {
            log("sort alpha");
            const moduleList = this.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
            Array.from(moduleList.children).sort(compareByTitle).forEach(node => moduleList.appendChild(node));
        });

        html[0].querySelector<HTMLElement>(".sort-alpha-reverse")!.addEventListener("click", function() {
            log("sort alpha reverse");
            const moduleList = this.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
            Array.from(moduleList.children).sort((a, b) => -1 * compareByTitle(a, b)).forEach(node => moduleList.appendChild(node));
        });
    }

    protected _createSearchFilters(): SearchFilter[] {
        return [new SearchFilter({contentSelector: ".module-list ul", inputSelector: ".filter", callback: function(event, typedText, rgx, parent) {
            // TODO the type of the last parameter (parent) is wrong in the doc
            for (let li of Array.from((parent as unknown as HTMLElement).children) as HTMLElement[]) {
                const name = li.querySelector(".title")!.textContent!;
                const match = rgx.test(SearchFilter.cleanQuery(name));
                li.style.display = match ? "" : "none";
            }
        }})];
    }

    async _updateObject(event: Event, formData: object) {
        log("_updateObject", formData);
    }
}

function showMainWindow() {
    new App(appData).render(true);
}

function showModuleSelectorWindow() {
    new ModuleSelector(Array.from(game.modules.values()), appData.selectedModules).render(true);
}

async function indexAssets() {
    for(const [name, module] of game.modules.entries()) {
        //log("module", module);
        if(isOfInterest(name)) {
            let packCount = 0;
            for(const pack of module.packs) {
                if(packCount > 3) { // TODO remove before putting into prod, this is just for faster testing
                    break;
                }
                if(pack.type == "Scene") {
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
                                appData.addScene(module.id, module.data.title, pack.name, pack.label, o);
                                assetCount++;
                            }
                        }
                    }
                    packCount++;
                }
            }
        }
        else {
            //log("ignore module", name);
        }
    }
}

Hooks.once('ready', async function() {
    log("inactive-asset-browser started");
    await indexAssets();
    log("assetCollection", appData.assetCollection);
    showMainWindow();
    showModuleSelectorWindow();
});
