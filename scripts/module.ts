import { SceneData, SceneDataConstructorData, SceneDataProperties } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/sceneData";
import { isBase64Image } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/validators.mjs";
import { ModuleData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/packages.mjs/moduleData";

const MODULE_NAME = "inactive-asset-browser";
const PATH_TO_ROOT_OF_MODULE = `modules/${MODULE_NAME}/`;

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
                    path: string,
                    assets: Asset[],
                }
            }
        }
    }
}

class AppDataClass implements AppData {
    assetCollection: AppData["assetCollection"] = {};

    constructor(private configManager: ConfigManager) { }

    loadCache() {
        return fetch(`${MODULE_NAME}/cache.json`).then(s => s.json() as Promise<typeof this.assetCollection>).then(ac => { this.assetCollection = ac; }).catch();
    }

    addScene(moduleId: string, moduleTitle: string, packName: string, packTitle: string, packPath: string, asset: SceneDataConstructorData) {
        let module = this.assetCollection[moduleId];
        if(module === undefined) {
            module = { title: moduleTitle, onePack: false, packs: {} };
            this.assetCollection[moduleId] = module;
        }
        let packInModule = module.packs[packName];
        if(packInModule === undefined) {
            packInModule = { title: packTitle, path: packPath, assets: [] };
            module.packs[packName] = packInModule;
        }
        packInModule.assets.push({
            name: asset.name,
            img: asset.img,
            thumb: asset.thumb,
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
        const module2 = this.assetCollection[moduleId];
        if(module2 === undefined) {
            this.addShalowModule(moduleId);
        }
        for(const pack of await packsFromModule(module)) {
            for(const scene of scenesFromPackContent(pack.content)) {
                this.addScene(module.id, module.data.title, pack.name, pack.title, pack.path, scene);
            }
        }
        this.saveCache();
        return this.assetCollection[moduleId];
    }

    async reindexModules(shalow: boolean, updater: IndexUpdateCallback | null) {
        const selectedModules = configManager.getSelectedModules();
        const info: IndexUpdateInfo = {
            message: null,
            existing: {
                modules: {
                    found: selectedModules.length,
                    finished: 0,
                },
                packs: {
                    found: 0,
                    finished: 0,
                },
                assets: {
                    found: 0,
                    finished: 0,
                },
            },
        };
        info.message = `Starting indexing ${info.existing.modules.found} modules`;
        updater?.(info);
        for(const [name, module] of game.modules.entries()) {
            if(selectedModules.includes(name)) {
                if(!shalow) {
                    const packs = await packsFromModule(module);
                    info.existing.packs.found += packs.length;
                    info.message = `Found ${info.existing.packs.found} packs in ${module.data.name}`;
                    updater?.(info);
                    for(const pack of packs) {
                        const scenes = scenesFromPackContent(pack.content);
                        info.existing.assets.found += scenes.length;
                        info.message = `Found ${info.existing.assets.found} assets in ${pack.name}`;
                        updater?.(info);
                        let sceneIndex = 0;
                        for(const scene of scenes) {
                            this.addScene(module.id, module.data.title, pack.name, pack.title, pack.path, scene);
                            info.existing.assets.finished++;
                            info.message = `Asset ${sceneIndex} finished`;
                            updater?.(info);
                            sceneIndex++;
                        }
                        info.existing.packs.finished++;
                        info.message = `Pack ${pack.name} finished`;
                        updater?.(info);
                    }
                }
                else {
                    this.addShalowModule(module.id);
                }
            }
            else {
                //log("ignore module", name);
            }
            info.existing.modules.finished++;
            info.message = `Module ${module.id} finished`;
            updater?.(info);
        }
        if(!shalow) {
            this.saveCache();
        }
        log("indexAssets.appData", this);
    }

    clearCache() {
        this.assetCollection = {};
    }

    private async convertThumbs() {
        try {
            await FilePicker.createDirectory("data", `${MODULE_NAME}/thumbs`);
        }
        catch(e) {
            log("thumbs directory already exists", e);
        }
        for(const [moduleId, module] of Object.entries(this.assetCollection)) {
            for(const [packId, pack] of Object.entries(module.packs)) {
                for(const [assetIndex, asset] of pack.assets.entries()) {
                    if(asset.thumb && asset.thumb.startsWith("data:")) {
                        const dataUrl = asset.thumb;
                        let ext: string | null = null;
                        const fileNameWithoutExt = `${moduleId}.${packId}.${assetIndex}`;
                        if(asset.thumb.startsWith("data:image/png")) {
                            ext = "png";
                        }
                        else if(asset.thumb.startsWith("data:image/jpg")) {
                            ext = "jpg";
                        }
                        else {
                            log("Could not deduce ext for", fileNameWithoutExt, asset.thumb.substring(0, 20));
                        }

                        if(ext) {
                            const dirPath = `${MODULE_NAME}/thumbs`;
                            const fileName = `${fileNameWithoutExt}.${ext}`;
                            asset.thumb = `${dirPath}/${fileName}`;
                            const blob = await dataUrlToFile(dataUrl);
                            const file = new File([blob], fileName, { type: 'application/json' });
                            await FilePicker.upload("data", dirPath, file, {});
                        }
                    }
                }
            }
        }
    }

    async saveCache() {
        try {
            await FilePicker.createDirectory("data", MODULE_NAME);
        }
        catch(e) {
            log("Cannot create dir", MODULE_NAME, e);
        }
        await this.convertThumbs();
        const blob = new Blob([JSON.stringify(this.assetCollection, null, 1)], { type: 'application/json' });
        const file = new File([blob], "cache.json", { type: 'application/json' });
        FilePicker.upload("data", MODULE_NAME, file, {});
    }
}

export async function dataUrlToFile(dataUrl: string): Promise<Blob> {
    const res: Response = await fetch(dataUrl);
    const blob: Blob = await res.blob();
    return blob;
}

function assert(cond: boolean): asserts cond {
    if(cond === false) {
        throw new Error("Value is null or undefined");
    }
}

function assertNever(x: never): never {
    throw new Error("Unexpected object: " + x);
}

class ConfigManager {
    private keys = {
        selectedModules: "selectedModules",
        moduleSortOrder: "moduleSortOrder",
    };
    private moduleSortOrderChoices = ["alpha", "alphaReversed", "checkedFirst"] as const;

    constructor(private modName: string) {
        this.registerSettings();
    }

    private registerSettings() {
        game.settings.register(this.modName, this.keys.selectedModules, {
            name: "Selected Modules",
            hint: "List of modules that will be browsed for assets",
            scope: "client",
            config: true,
            type: Object,
            default: [],
            onChange: (newValue) => log(`${this.keys.selectedModules} changed to`, newValue)
        });
        game.settings.register(this.modName, this.keys.moduleSortOrder, {
            name: "Sort Order",
            hint: "Order in which to sort the modules",
            scope: "client",
            config: true,
            type: String,
            default: "alpha",
            choices: { alpha: "alphabetical order", alphaReversed: "reverse alphabetical order", checkedFirst: "checked modules first" },
            onChange: (newValue) => log(`${this.keys.moduleSortOrder} changed to`, newValue)
        });
    }

    setSelectedModules(selectedModules: string[]) {
        game.settings.set(this.modName, this.keys.selectedModules, selectedModules);
    }

    getSelectedModules(): readonly string[] {
        return game.settings.get(this.modName, this.keys.selectedModules) as string[];
    }

    setModuleSortOrder(sortOrder: ValueOf<typeof this.moduleSortOrderChoices>) {
        game.settings.set(this.modName, this.keys.moduleSortOrder, sortOrder);
    }

    getModuleSortOrder() {
        return game.settings.get(this.modName, this.keys.moduleSortOrder) as ValueOf<typeof this.moduleSortOrderChoices>;
    }
}

function joinPath(...paths: string[]) {
    return paths.join("/");
}

function log(message: unknown, ...otherMessages: unknown[]) {
    console.log(MODULE_NAME, "|", message, ...otherMessages);
}

let configManager: ConfigManager;
let appData: AppDataClass;

Hooks.once('init', async function() {
    configManager = new ConfigManager(MODULE_NAME);
    appData = new AppDataClass(configManager);
});

class AssetLister extends FormApplication<FormApplicationOptions, AppData, {}> {
    private currentAsset: null | { moduleName: string, packName: string, assetNumber: number } = null;

    constructor(private data: AppDataClass) {
        super({}, {
            resizable: true,
            scrollY: [".modules"],
            width: 500,
            height: Math.round(window.innerHeight / 2)
        });
        log("creating window for", MODULE_NAME);
        this.data.loadCache().then(() => this.render(true));
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

    private async onReIndex() {
        log("Re-Index!!!");
        appData.clearCache();
        await this.data.reindexModules(false, info => log(new Date(), info));
        log("Start rendering after indexing", new Date());
        await this._render();
        log("Finished rendering after indexing", new Date());
    }

    private async onAddScene() {
        log("adding", this.currentAsset);
        assert(this.currentAsset != null);
        const pack = this.data.assetCollection[this.currentAsset.moduleName].packs[this.currentAsset.packName];
        const asset = pack.assets[this.currentAsset.assetNumber];
        log(asset);
        const rawPack = await getPackContent(this.currentAsset.moduleName, pack.path);
        const fullAsset = sceneFromPackContent(rawPack, this.currentAsset.assetNumber);
        assert(fullAsset != undefined);
        let newScene = await Scene.create(fullAsset);
        assert(newScene != undefined);
        let tData = await newScene.createThumbnail();
        await newScene.update({ thumb: tData.thumb }); // force generating the thumbnail
    }

    private onAssetClick(win: HTMLElement, asset: HTMLElement) {
        log("asset click", asset);
        assert(asset.dataset.moduleName != undefined);
        assert(asset.dataset.packName != undefined);
        assert(asset.dataset.assetName != undefined);
        assert(asset.dataset.assetNumber != undefined);
        win.querySelector(".panel .asset-view")!.innerHTML = `${asset.dataset.moduleName}.${asset.dataset.packName}/${asset.dataset.assetName}`
        this.currentAsset = { moduleName: asset.dataset.moduleName, packName: asset.dataset.packName, assetNumber: parseInt(asset.dataset.assetNumber, 10) };
    }

    private async onRefreshModule(btn: HTMLElement) {
        const h1 = btn.closest("h1")!;
        log("refresh", h1);
        await this.data.reindexModule(h1.dataset.moduleName!);
        this.render();
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        win.querySelector(".re-index")!.addEventListener("click", () => this.onReIndex());

        win.querySelector(".select-modules")!.addEventListener("click", () => showModuleSelectorWindow());

        win.querySelector(".add-scene")!.addEventListener("click", () => this.onAddScene());

        win.querySelectorAll<HTMLElement>(".asset").forEach(asset => asset.addEventListener("click", (e) => this.onAssetClick(win, asset)));

        win.querySelectorAll<HTMLElement>(".refresh-module")!.forEach(btn => btn.addEventListener("click", () => this.onRefreshModule(btn)));

        win.querySelector<HTMLInputElement>(".keywords input")!.addEventListener("input", function() {
            log("keywords changed", this.value);
        });
    }

    async _updateObject(event: Event, formData: unknown) {
        log("_updateObject", formData);
    }

    protected _createSearchFilters(): SearchFilter[] {
        return [new SearchFilter({
            contentSelector: ".modules", inputSelector: ".filter", callback: function(event, typedText, rgx, parent) {
                // TODO the type of the last parameter (parent) is wrong in the doc
                log(parent);
                if(typedText.length === 0) {
                    return;
                }
                const parent2 = (parent as unknown as HTMLElement);
                for(const assetElement of Array.from(parent2.querySelectorAll<HTMLElement>(".asset"))) {
                    const name = assetElement.querySelector(".name")!.textContent!;
                    const match = rgx.test(SearchFilter.cleanQuery(name));
                    assetElement.style.display = match ? "" : "none";
                }
                for(const packElement of Array.from(parent2.querySelectorAll<HTMLElement>(".pack"))) {
                    const notEmpty = Array.from(packElement.querySelectorAll<HTMLElement>(".asset")).some(e => e.style.display != "none");
                    if(notEmpty) {
                        packElement.style.display = "";
                    }
                    else {
                        packElement.style.display = "none";
                    }
                }
                for(const moduleElement of Array.from(parent2.querySelectorAll<HTMLElement>(".module"))) {
                    const notEmpty = Array.from(moduleElement.querySelectorAll<HTMLElement>(".pack")).some(e => e.style.display != "none");
                    if(notEmpty) {
                        moduleElement.style.display = "";
                    }
                    else {
                        moduleElement.style.display = "none";
                    }
                }
            }
        })];
    }
}

class ModuleSelector extends FormApplication<FormApplicationOptions, { existingModules: { [moduleName: string]: { module: Game.ModuleData<ModuleData>, selected: boolean } } }, string[]> {
    constructor(private existingModules: Game.ModuleData<ModuleData>[], private appData: AppDataClass, private assetLister: AssetLister, private configManager: ConfigManager) {
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
        const o: { [moduleName: string]: { module: Game.ModuleData<ModuleData>, selected: boolean } } = {};
        const selectedModules = this.configManager.getSelectedModules();
        for(const m of Array.from(this.existingModules)) {
            o[m.id] = { module: m, selected: selectedModules.includes(m.id) };
        }
        return { existingModules: o };
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

    private onCheckAll(base: HTMLElement) {
        const moduleList = base.closest("form")!.querySelectorAll<HTMLInputElement>('.module-list ul input[type="checkbox"]').forEach(checkbox => {
            const li = checkbox.closest<HTMLElement>("li")!;
            if(li.style.display !== "none" && getComputedStyle(li).display !== "none") {
                checkbox.checked = true;
            }
        });
    }

    private onCheckNone(base: HTMLElement) {
        const moduleList = base.closest("form")!.querySelectorAll<HTMLInputElement>('.module-list ul input[type="checkbox"]').forEach(checkbox => {
            if(checkbox.closest<HTMLElement>("li")!.style.display !== "none") {
                checkbox.checked = false;
            }
        });
    }

    private onShowOnlyModulesWithScenes(win: HTMLElement, base: HTMLElement) {
        win.classList.add("show-only-modules-with-scenes");
        base.closest("form")!.querySelectorAll<HTMLInputElement>('.module-list ul li').forEach(async li => {
            const moduleName = li.dataset.moduleName!;
            let module: typeof this.appData.assetCollection["modName"] | undefined = this.appData.assetCollection[moduleName];
            let packs: [packName: string, pack: typeof this.appData.assetCollection["modName"]["packs"]["packName"]][];
            if(module === undefined) {
                module = await this.appData.reindexModule(moduleName);
                packs = Object.entries(module.packs);
            }
            else {
                packs = Object.entries(module.packs);
                if(packs.length === 0) {
                    module = await this.appData.reindexModule(moduleName);
                    packs = Object.entries(module.packs);
                }
            }

            let hasScene: boolean = packs.some(([k, v]) => v.assets.length !== 0);
            li.classList.remove("unkown-scene-status");
            li.classList.toggle("has-scene", hasScene);
            li.classList.toggle("no-scene", !hasScene);
        });
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        const self = this;
        win.querySelector<HTMLElement>(".sort-selected")!.addEventListener("click", function() {
            self.sortModulesByChecked(this);
            self.configManager.setModuleSortOrder("checkedFirst");
        });

        win.querySelector<HTMLElement>(".sort-alpha")!.addEventListener("click", function() {
            self.sortModulesByAlpha(this);
            self.configManager.setModuleSortOrder("alpha");
        });

        win.querySelector<HTMLElement>(".sort-alpha-reverse")!.addEventListener("click", function() {
            self.sortModulesByAlphaReversed(this);
            self.configManager.setModuleSortOrder("alphaReversed");
        });

        win.querySelector<HTMLElement>(".check-all")!.addEventListener("click", function() { self.onCheckAll(this); });

        win.querySelector<HTMLElement>(".check-none")!.addEventListener("click", function() { self.onCheckNone(this); });

        win.querySelector<HTMLElement>("button.show-only-modules-with-scenes")!.addEventListener("click", function() { self.onShowOnlyModulesWithScenes(win, this); });

        win.querySelector<HTMLElement>("button.show-all-modules")!.addEventListener("click", function() {
            win.classList.remove("show-only-modules-with-scenes");
        });

        // TODO this is probably not the right place to do it, but I don't know where to actually do this
        const sortOrder = this.configManager.getModuleSortOrder();
        if(sortOrder === "alpha") {
            this.sortModulesByAlpha(win.querySelector(".sort-alpha")!);
        }
        else if(sortOrder === "alphaReversed") {
            this.sortModulesByAlphaReversed(win.querySelector(".sort-alpha-reverse")!);
        }
        else if(sortOrder === "checkedFirst") {
            this.sortModulesByChecked(win.querySelector(".sort-selected")!);
        }
        else {
            assertNever(sortOrder);
        }
    }

    protected _createSearchFilters(): SearchFilter[] {
        return [new SearchFilter({
            contentSelector: ".module-list ul", inputSelector: ".filter", callback: function(event, typedText, rgx, parent) {
                // TODO the type of the last parameter (parent) is wrong in the doc
                for(let li of Array.from((parent as unknown as HTMLElement).children) as HTMLElement[]) {
                    const name = li.querySelector(".title")!.textContent!;
                    const match = rgx.test(SearchFilter.cleanQuery(name));
                    li.style.display = match ? "" : "none";
                }
            }
        })];
    }

    async _updateObject(event: Event, formData: { [moduleName: string]: boolean }) {
        log("_updateObject", formData);
        this.configManager.setSelectedModules(Object.entries(formData).filter(([k, v]) => v === true).map(([k, v]) => k));
        Object.entries(formData).forEach(([moduleName, selected]) => {
            if(selected === true) {
                this.appData.addShalowModule(moduleName);
            }
        });
        this.assetLister.render();
    }
}

let assetLister: AssetLister | null = null;
async function showMainWindow() {
    assetLister = new AssetLister(appData);
    assetLister.render(true);
}

function showModuleSelectorWindow() {
    assert(assetLister != null);
    new ModuleSelector(Array.from(game.modules.values()), appData, assetLister, configManager).render(true);
}

function scenesFromPackContent(content: string) {
    const scenes: SceneDataConstructorData[] = [];
    const lines = content.split(/\r?\n/);
    let assetCount = 0;
    for(const line of lines) {
        if(line !== "") {
            /*
            if(assetCount >= 5) { // TODO remove before putting into prod, this is just for faster testing
                break;
            }
            */
            const o = JSON.parse(line) as SceneDataConstructorData;
            if(o.name !== '#[CF_tempEntity]') {
                scenes.push(o);
                assetCount++;
            }
        }
    }
    return scenes;
}

function sceneFromPackContent(content: string, index: number): SceneDataConstructorData | undefined {
    const lines = content.split(/\r?\n/);
    let assetCount = 0;
    for(const line of lines) {
        if(line !== "") {
            const o = JSON.parse(line) as SceneDataConstructorData;
            if(o.name !== '#[CF_tempEntity]') {
                if(index === assetCount) {
                    return o;
                }
                assetCount++;
            }
        }
    }
    return undefined;
}

async function getPackContent(moduleId: string, packPath: string) {
    const url = "modules/" + moduleId + "/" + packPath;
    const r = await fetch(url);
    const text = await r.text();
    return text;
}

async function packsFromModule(module: Game.ModuleData<ModuleData>) {
    const packContents: { content: string, name: string, title: string, path: string }[] = [];
    let packCount = 0;
    for(const pack of module.packs) {
        if(packCount > 3) { // TODO remove before putting into prod, this is just for faster testing
            break;
        }
        if(pack.type == "Scene") {
            const text = await getPackContent(module.id, pack.path);
            packContents.push({ content: text, name: pack.name, title: pack.label, path: pack.path });
            packCount++;
        }
    }
    return packContents;
}

type IndexUpdateInfo = {
    message: string | null,
    existing: {
        modules: {
            found: number,
            finished: number,
        },
        packs: {
            found: number,
            finished: number,
        },
        assets: {
            found: number,
            finished: number,
        }
    },
};

type IndexUpdateCallback = (info: IndexUpdateInfo) => void;

Hooks.once('ready', async function() {
    log("started");
    appData.reindexModules(true, null);
    log("appData ready", appData);
});

function addControls(html: HTMLElement) {
    const wrapper = document.createElement("div");
    wrapper.innerHTML = `<li class="scene-control ${MODULE_NAME}-scene-control" data-control="${MODULE_NAME}" title="${MODULE_NAME}"><i class="fas fa-map-signs"></i></li>`;
    const btn = wrapper.firstChild!;
    btn.addEventListener("click", () => showMainWindow());
    html.querySelector(".main-controls")?.appendChild(btn);
}

Hooks.on<Hooks.RenderApplication<SceneControls>>('renderSceneControls', (sceneControls, html, data) => {
    if(game.user?.isGM ?? false) {
        addControls(html[0]);
    }
});