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

    addShalowModule(moduleId: string) {
        let module = this.assetCollection[moduleId];
        if(module === undefined) {
            module = { title: game.modules.get(moduleId)!.data.name, onePack: false, packs: {} };
            this.assetCollection[moduleId] = module;
        }
    }

    async reindexModule(moduleId: string) {
        const module = game.modules.get(moduleId);
        if(module === undefined) {
            throw new Error("Module not found: " + moduleId);
        }

        this.assetCollection[moduleId].packs = {};
        for(const pack of await packsFromModule(module)) {
            for(const scene of scenesFromPackContent(pack.content)) {
                this.addScene(module.id, module.data.title, pack.name, pack.title, scene);
            }
        }
    }

    clearCache() {
        this.assetCollection = {};
    }
}

function assert(cond: boolean): asserts cond {
    if(cond === false) {
        throw new Error("Value is null or undefined");
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

class App extends FormApplication<FormApplicationOptions, AppData, {}> {
    constructor(private data: AppDataClass) {
        super({}, {
            resizable: true,
            scrollY: [".modules"],
            width: 500,
            height: Math.round(window.innerHeight / 2)
        });
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
            await indexAssets(true);
            this.render();
        });

        win.querySelector(".select-modules")!.addEventListener("click", () => showModuleSelectorWindow());

        win.querySelectorAll<HTMLElement>(".asset").forEach(asset => asset.addEventListener("click", async (e) => {
            log("asset click", e, asset);
            win.querySelector(".panel .asset-view")!.innerHTML = `${asset.dataset.moduleName}.${asset.dataset.packName}/${asset.dataset.assetName}`
        }));

        win.querySelectorAll<HTMLElement>(".refresh-module")!.forEach(btn => btn.addEventListener("click", async () => {
            const h1 = btn.closest("h1")!;
            log("refresh", h1);
            await this.data.reindexModule(h1.dataset.moduleName!);
            this.render();
        }));
    }

    async _updateObject(event: Event, formData: unknown) {
        log("_updateObject", formData);
    }
}

class ModuleSelector extends FormApplication<FormApplicationOptions, {existingModules: {[moduleName: string]: {module: Game.ModuleData<ModuleData>, selected: boolean}}}, AppData["selectedModules"]> {
    constructor(private existingModules: Game.ModuleData<ModuleData>[], private selectedModules: string[], private appData: AppDataClass, private app: App) {
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
        for(const m of Array.from(this.existingModules)) {
            o[m.id] = {module: m, selected: this.selectedModules.includes(m.id)};
        }
        return {existingModules: o};
    }

    private static compareByTitle(a: Element, b: Element) {
        const titleA = a.querySelector(".title")!.innerHTML;
        const titleB = b.querySelector(".title")!.innerHTML;
        return titleA.localeCompare(titleB);
    }

    private static compareByChecked(a: Element, b: Element) {
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
        return 0;
    }

    private sortModulesByChecked(base: HTMLElement) {
        log("sort checked");
        const moduleList = base.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
        Array.from(moduleList.children).sort((a, b) => {
            const checkedCompare = ModuleSelector.compareByChecked(a, b);
            if(checkedCompare !== 0) {
                return checkedCompare;
            }
            return ModuleSelector.compareByTitle(a, b);
        }).forEach(node => moduleList.appendChild(node));
    }

    private sortModulesByAlpha(base: HTMLElement) {
        log("sort alpha");
        const moduleList = base.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
        Array.from(moduleList.children).sort(ModuleSelector.compareByTitle).forEach(node => moduleList.appendChild(node));
    }

    private sortModulesByAlphaReversed(base: HTMLElement) {
        log("sort alpha reverse");
        const moduleList = base.closest("form")!.querySelector<HTMLElement>(".module-list ul")!;
        Array.from(moduleList.children).sort((a, b) => -1 * ModuleSelector.compareByTitle(a, b)).forEach(node => moduleList.appendChild(node));
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const self = this;
        html[0].querySelector<HTMLElement>(".sort-selected")!.addEventListener("click", function() {
            self.sortModulesByChecked(this);
        });

        html[0].querySelector<HTMLElement>(".sort-alpha")!.addEventListener("click", function() {
            self.sortModulesByAlpha(this);
        });

        html[0].querySelector<HTMLElement>(".sort-alpha-reverse")!.addEventListener("click", function() {
            self.sortModulesByAlphaReversed(this);
        });

        this.sortModulesByAlpha(html[0].querySelector(".sort-selected")!);
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

    async _updateObject(event: Event, formData: {[moduleName: string]: boolean}) {
        log("_updateObject", formData);
        this.appData.selectedModules = Object.entries(formData).filter(([k, v]) => v === true).map(([k, v]) => k);
        Object.entries(formData).forEach(([moduleName, selected]) => {
            if(selected === true) {
                this.appData.addShalowModule(moduleName);
            }
        });
        this.app.render();
    }
}

let app: App | null = null;
function showMainWindow() {
    app = new App(appData);
    app.render(true);
}

function showModuleSelectorWindow() {
    assert(app != null);
    new ModuleSelector(Array.from(game.modules.values()), appData.selectedModules, appData, app).render(true);
}

function scenesFromPackContent(content: string) {
    const scenes: SceneDataProperties[] = [];
    const lines = content.split(/\r?\n/);
    let assetCount = 0;
    for(const line of lines) {
        if(line !== "") {
            if(assetCount >= 5) { // TODO remove before putting into prod, this is just for faster testing
                break;
            }
            const o = JSON.parse(line) as SceneDataProperties;
            if(o.name !== '#[CF_tempEntity]') {
                scenes.push(o);
                assetCount++;
            }
        }
    }
    return scenes;
}

async function packsFromModule(module: Game.ModuleData<ModuleData>) {
    const packContents: {content: string, name: string, title: string}[] = [];
    let packCount = 0;
    for(const pack of module.packs) {
        if(packCount > 3) { // TODO remove before putting into prod, this is just for faster testing
            break;
        }
        if(pack.type == "Scene") {
            const url = "modules/" + module.id + "/" + pack.path;
            const r = await fetch(url);
            const text = await r.text();
            packContents.push({content: text, name: pack.name, title: pack.label});
            packCount++;
        }
    }
    return packContents;
}

async function indexAssets(shalow: boolean) {
    for(const [name, module] of game.modules.entries()) {
        //log("module", module);
        if(appData.selectedModules.includes(name)) {
            let packCount = 0;
            if(!shalow) {
                for(const pack of await packsFromModule(module)) {
                    for(const scene of scenesFromPackContent(pack.content)) {
                        appData.addScene(module.id, module.data.title, pack.name, pack.title, scene);
                    }
                }
            }
            else {
                appData.addShalowModule(module.id);
            }
        }
        else {
            //log("ignore module", name);
        }
    }
    log("indexAssets.appData", appData);
}

Hooks.once('ready', async function() {
    log("started");
    await indexAssets(true);
    log("appData ready", appData);
    showMainWindow();
    showModuleSelectorWindow();
});
