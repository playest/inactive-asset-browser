import { SceneDataConstructorData } from "@league-of-foundry-developers/foundry-vtt-types/src/foundry/common/data/data.mjs/sceneData";
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

export function sanitizeFilename(fileName: string) {
    return fileName.replace("'", "").replace(/[^a-z0-9]+/gi, " ").trim().replace(/\s+|-{2,}/g, "-").toLowerCase();
}

type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>

interface Asset {
    name: string,
    img: string | null | undefined, // we should probably exclude those without image
    thumb: string | null | undefined,
}

interface PackInCache<Content> {
    title: string,
    path: string,
    assets: { [assetName: string]: Content },
}

interface ModuleInCache<Content> {
    title: string,
    onePack: boolean,
    packs: {
        [packName: string]: PackInCache<Content>
    }
}

interface DataByModule<Content> {
    [moduleName: string]: ModuleInCache<Content>
}

class ModulePackAssetMapping<Content> {
    private assetCollection: DataByModule<Content> = {};

    /** Do not modify the returned value */
    getAssetCollection() {
        return this.assetCollection;
    }

    getModule(moduleName: string) {
        return this.assetCollection[moduleName];
    }

    getModuleOr(moduleName: string, defaultModule: () => { title: string }) {
        let maybeModule = this.assetCollection[moduleName];
        if(maybeModule == undefined) {
            maybeModule = {
                title: defaultModule().title,
                onePack: false,
                packs: {}
            };
            this.assetCollection[moduleName] = maybeModule;
        }
        return maybeModule;
    }

    getPack(moduleName: string, packName: string) {
        return this.assetCollection[moduleName]?.packs[packName];
    }

    getPackOr(moduleName: string, packName: string, defaultModule: () => { title: string }, defaultPack: () => { title: string, path: string }) {
        const module = this.getModuleOr(moduleName, defaultModule);
        let maybePack = module.packs[packName];
        if(maybePack == undefined) {
            const p = defaultPack();
            maybePack = {
                assets: {},
                path: p.path,
                title: p.title,
            };
            module.packs[packName] = maybePack;
        }
        return maybePack;
    }

    getAsset(moduleName: string, packName: string, contentName: string) {
        return this.assetCollection[moduleName]?.packs[packName]?.assets[contentName];
    }

    getAssetOr(moduleName: string, packName: string, contentName: string, defaultModule: () => { title: string }, defaultPack: () => { title: string, path: string }, defaultContent: () => Content) {
        const pack = this.getPackOr(moduleName, packName, defaultModule, defaultPack);
        let maybeAsset = pack.assets[contentName];
        if(maybeAsset == undefined) {
            maybeAsset = defaultContent();
            pack.assets[contentName] = defaultContent();
        }
        return maybeAsset;
    }


    moduleCount() {
        return Object.keys(this.assetCollection).length;
    }

    packCount() {
        let packCount = 0;
        for(const module of Object.values(this.assetCollection)) {
            packCount += Object.keys(module.packs).length;
        }
        return packCount;
    }

    assetCount() {
        let assetCount = 0;
        for(const module of Object.values(this.assetCollection)) {
            for(const pack of Object.values(module.packs)) {
                assetCount += Object.keys(pack.assets).length;
            }
        }
        return assetCount;
    }

    assetCountInModule(module: ModuleInCache<Content>) {
        return Object.values(module.packs).reduce((prev, cur) => prev + Object.keys(cur.assets).length, 0);
    }

    * moduleGenerator(data: DataByModule<Content>) {
        for(const [moduleName, module] of Object.entries(data)) {
            yield { moduleName, module };
        }
    }

    * packGenerator(module: ModuleInCache<Content>) {
        for(const [packName, pack] of Object.entries(module.packs)) {
            yield { packName, pack };
        }
    }

    * assetGenerator(pack: PackInCache<Content>) {
        for(const [assetKey, asset] of Object.entries(pack.assets)) {
            yield { assetKey, asset };
        }
    }

    * allAssetGenerator() {
        for(const { moduleName, module } of this.moduleGenerator(this.assetCollection)) {
            let packIndex: number = 0;
            for(const { packName, pack } of this.packGenerator(module)) {
                let assetIndex = 0;
                for(const { assetKey, asset } of this.assetGenerator(pack)) {
                    yield { moduleName, module, packName, pack, assetKey, asset, lastPack: (Object.keys(module.packs).length - 1) == packIndex, lastAsset: (Object.keys(pack.assets).length - 1) == assetIndex };
                    assetIndex++;
                }
                packIndex++;
            }
        }
    }

    clear() {
        this.assetCollection = {};
    }

    load(data: DataByModule<Content>) {
        this.assetCollection = data;
    }

    serialize() {
        return JSON.stringify(this.assetCollection, null, 1);
    }
}

class AppDataClass {
    public readonly assetMapping = new ModulePackAssetMapping<Asset>();

    constructor(private configManager: ConfigManager) { }

    addScene(moduleName: string, moduleTitle: string, packName: string, packTitle: string, packPath: string, assetIndex: number, asset: SceneDataConstructorData) {
        const asset2 = { name: asset.name, img: asset.img, thumb: asset.thumb };
        this.assetMapping.getPackOr(
                moduleName,
                packName,
                () => { return { title: moduleTitle } },
                () => { return { title: packTitle, path: packPath } }
            ).assets[AppDataClass.assetToAssetKey(asset)] = asset2;
    }

    addShalowModule(moduleName: string) {
        this.assetMapping.getModuleOr(moduleName, () => { return this.getShalowModuleStruct(moduleName) });
    }

    loadCache() {
        return fetch(`${MODULE_NAME}/cache.json`).then(s => s.json() as Promise<DataByModule<Asset>>).then(ac => this.assetMapping.load(ac)).catch();
    }

    private getShalowModuleStruct(moduleName: string) {
        const gameModule = game.modules.get(moduleName);
        assert(gameModule != undefined);
        return { title: gameModule.data.name };
    }

    private static assetToAssetKey(asset: PartialBy<Asset, "img" | "thumb">) {
        return `${asset.name}.${asset.img}`
    }

    async reindexModule(moduleName: string, updater: ProgressViewer | null) {
        const gameModule = game.modules.get(moduleName);
        assert(gameModule != undefined, "Module not found: " + moduleName);
        const module = this.assetMapping.getModuleOr(moduleName, () => this.getShalowModuleStruct(moduleName));
        for(const pack of await packsFromModule(gameModule)) {
            for(const [sceneIndex, scene] of scenesFromPackContent(pack.content).entries()) {
                this.addScene(gameModule.id, gameModule.data.title, pack.name, pack.title, pack.path, sceneIndex, scene);
            }
        }
        return module; // TODO was this.assetCollection[moduleId], check that using module works
    }

    // TODO see usage of this function, we probably need to put it somewhere where it makes more sense
    private static formatForProgressViewer(info: IndexUpdateInfo) {
        const finished = info.existing.modules.finished + info.existing.packs.finished + info.existing.assets.finished;
        const found = info.existing.modules.found + info.existing.packs.found + info.existing.assets.found;
        return [finished, found, info.message, info] as const;
    }

    async reindexModules(shalow: boolean, updater: ProgressViewer | null) {
        const selectedModules = configManager.getSelectedModules();
        const info: IndexUpdateInfo = {
            message: null,
            finished: false,
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
        updater?.update(...AppDataClass.formatForProgressViewer(info));
        for(const [name, module] of game.modules.entries()) {
            if(selectedModules.includes(name)) {
                if(!shalow) {
                    const packs = await packsFromModule(module);
                    info.existing.packs.found += packs.length;
                    info.message = `Found ${info.existing.packs.found} packs in ${module.data.name}`;
                    updater?.update(...AppDataClass.formatForProgressViewer(info));
                    for(const pack of packs) {
                        const scenes = scenesFromPackContent(pack.content);
                        info.existing.assets.found += scenes.length;
                        info.message = `Found ${info.existing.assets.found} assets in ${pack.name}`;
                        updater?.update(...AppDataClass.formatForProgressViewer(info));
                        for(const [sceneIndex, scene] of scenes.entries()) {
                            this.addScene(module.id, module.data.title, pack.name, pack.title, pack.path, sceneIndex, scene);
                            info.existing.assets.finished++;
                            info.message = `Asset ${sceneIndex} finished`;
                            updater?.update(...AppDataClass.formatForProgressViewer(info));
                        }
                        info.existing.packs.finished++;
                        info.message = `Pack ${pack.name} finished`;
                        updater?.update(...AppDataClass.formatForProgressViewer(info));
                    }
                }
                else {
                    this.addShalowModule(module.id);
                }
                info.existing.modules.finished++;
                info.message = `Module ${module.id} finished`;
                updater?.update(...AppDataClass.formatForProgressViewer(info));
            }
            else {
                //log("ignore module", name);
            }
        }
        if(!shalow) {
            this.saveCache(updater);
        }

        info.finished = true;
        info.message = "Indexing finished";
        updater?.update(...AppDataClass.formatForProgressViewer(info));
        log("indexAssets.appData", this);
    }

    clearCache() {
        this.assetMapping.clear();
    }

    private async convertThumbs(progressViewer: ProgressViewer | null) {
        try {
            await FilePicker.createDirectory("data", `${MODULE_NAME}/thumbs`);
        }
        catch(e) {
            log("thumbs directory already exists", e);
        }

        const info: IndexUpdateInfo = {
            message: null,
            finished: false,
            existing: {
                modules: {
                    found: this.assetMapping.moduleCount(),
                    finished: 0,
                },
                packs: {
                    found: this.assetMapping.packCount(),
                    finished: 0,
                },
                assets: {
                    found: this.assetMapping.assetCount(),
                    finished: 0,
                },
            },
        };

        for(const { moduleName, module, packName, pack, assetKey, asset, lastPack, lastAsset } of this.assetMapping.allAssetGenerator()) {
            info.message = null;
            if(asset.thumb && asset.thumb.startsWith("data:")) {
                const dataUrl = asset.thumb;
                let ext: string | null = null;
                const fileNameWithoutExt = sanitizeFilename(`${moduleName}.${packName}.${asset.name}`);
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
                    info.message = `Saved thumb ${fileName}`;
                    asset.thumb = `${dirPath}/${fileName}`;
                    const blob = await dataUrlToFile(dataUrl);
                    const file = new File([blob], fileName, { type: 'application/json' });
                    await FilePicker.upload("data", dirPath, file, {});
                }
                else {
                    info.message = null;
                }
            }
            else {
                info.message = null;
            }
            info.existing.assets.finished++;
            progressViewer?.update(...AppDataClass.formatForProgressViewer(info));
            log("lastPack", lastPack);
            if(lastAsset) {
                info.existing.packs.finished++;
                info.message = `Finished thumbs for pack ${packName}`;
                progressViewer?.update(...AppDataClass.formatForProgressViewer(info));
            }
            if(lastPack && lastAsset) {
                info.existing.modules.finished++;
                info.message = `Finished thumbs for module ${moduleName}`;
                progressViewer?.update(...AppDataClass.formatForProgressViewer(info));
            }
        }
    }

    async saveCache(progressViewer: ProgressViewer | null) {
        try {
            await FilePicker.createDirectory("data", MODULE_NAME);
        }
        catch(e) {
            log("Cannot create dir", MODULE_NAME, e);
        }
        await this.convertThumbs(progressViewer);
        const blob = new Blob([this.assetMapping.serialize()], { type: 'application/json' });
        const file = new File([blob], "cache.json", { type: 'application/json' });
        FilePicker.upload("data", MODULE_NAME, file, {});
    }
    
    getAssetCollection() {
        return this.assetMapping.getAssetCollection();
    }
}

export async function dataUrlToFile(dataUrl: string): Promise<Blob> {
    const res: Response = await fetch(dataUrl);
    const blob: Blob = await res.blob();
    return blob;
}

function assert(cond: boolean, msg?: string): asserts cond {
    if(cond === false) {
        throw new Error("Value is null or undefined: " + (msg ?? "no message"));
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

class AssetLister extends FormApplication<FormApplicationOptions, { assetCollection: DataByModule<Asset> }, {}> {
    private currentAsset: null | { moduleName: string, packName: string, assetName: string, assetIndex: number } = null;

    constructor(private data: AppDataClass) {
        super({}, {
            resizable: true,
            scrollY: [".modules"],
            // TODO save last size in the config
            width: 900,
            height: 500,
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
        return { assetCollection: this.data.getAssetCollection() };
    }

    private async onReIndex() {
        log("Re-Index!!!");
        appData.clearCache();
        await this.data.reindexModules(false, new ProgressViewer());
        log("Start rendering after indexing", new Date());
        await this._render();
        log("Finished rendering after indexing", new Date());
    }

    private onSave() {
        this.data.saveCache(new ProgressViewer());
    }

    private onLoad() {
        this.data.loadCache().then(() => this.render(true));
    }

    private async onAddScene() {
        log("adding", this.currentAsset);

        assert(this.currentAsset != null);
        const pack = this.data.assetMapping.getPack(this.currentAsset.moduleName, this.currentAsset.packName);

        assert(pack != undefined);
        const rawPack = await getPackContent(this.currentAsset.moduleName, pack.path);

        const fullAsset = sceneFromPackContent(rawPack, this.currentAsset.assetIndex);
        assert(fullAsset != undefined);

        let newScene = await Scene.create(fullAsset);
        assert(newScene != undefined);

        let tData = await newScene.createThumbnail();
        await newScene.update({ thumb: tData.thumb }); // force generating the thumbnail
    }

    private onAssetClick(win: HTMLElement, assetElement: HTMLElement) {
        log("asset click", assetElement);
        assert(assetElement.dataset.moduleName != undefined);
        assert(assetElement.dataset.packName != undefined);
        assert(assetElement.dataset.assetName != undefined);
        const asset = this.data.assetMapping.getAsset(assetElement.dataset.moduleName, assetElement.dataset.packName, assetElement.dataset.assetName);
        const container = document.createElement("div");
        if(asset != undefined) {
            container.innerHTML = `<div>${assetElement.dataset.moduleName}.${assetElement.dataset.packName}/${assetElement.dataset.assetName}</div><div><img src="${asset.img}" /></div>`;
        }
        else {
            container.innerHTML = `<div>${assetElement.dataset.moduleName}.${assetElement.dataset.packName}/${assetElement.dataset.assetName}</div><div>Could not find image.</div>`;
        }
        win.querySelector(".panel .asset-view")!.replaceChildren(container);
        this.currentAsset = { moduleName: assetElement.dataset.moduleName, packName: assetElement.dataset.packName, assetName: assetElement.dataset.assetName, assetIndex: parseInt(assetElement.dataset.assetIndex!, 10) };
    }

    private async onRefreshModule(btn: HTMLElement) {
        const h1 = btn.closest("h1")!;
        log("refresh", h1);
        // TODO use then to avoid await
        const pv = new ProgressViewer();
        await this.data.reindexModule(h1.dataset.moduleName!, pv);
        this.data.saveCache(pv);
        this.render();
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        assert(win != undefined);
        win.querySelector(".re-index")!.addEventListener("click", () => this.onReIndex());

        win.querySelector(".save")!.addEventListener("click", () => this.onSave());

        win.querySelector(".load")!.addEventListener("click", () => this.onLoad());

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

class ProgressViewer {
    private dialog: Dialog;
    private disableNotifications: boolean = true;
    constructor() {
        if(this.disableNotifications) {
            ui.notifications.close();
        }
        this.dialog = new Dialog({
            title: "Progress",
            buttons: {},
            content: '<progress max="100" value="0">?%</progress><textarea class="messages"></textarea><textarea class="debug"></textarea>',
            default: "Close",
            close: () => {
                if(this.disableNotifications) {
                    ui.notifications = new Notifications();
                    ui.notifications.render(true);
                }
            }
        },
            {
                classes: [MODULE_NAME, "progress-viewer"],
                resizable: true,
            });
        this.dialog.render(true);
    }

    update(finished: number, total: number, message: string | null, debugInfo: unknown) {
        const win = this.dialog.element[0];
        if(win != null) {
            const progress = win.querySelector<HTMLProgressElement>("progress");
            if(progress != null) {
                progress.value = finished;
                progress.max = total;

                if(message != null) {
                    const messages = win.querySelector<HTMLProgressElement>("textarea.messages")!;
                    messages.innerHTML += "\n" + message;
                    messages.scrollTop = messages.scrollHeight; // scroll to bottom
                }

                const debug = win.querySelector<HTMLProgressElement>("textarea.debug")!;
                debug.innerHTML = JSON.stringify(debugInfo);
                log("update ProgressViewer", debugInfo);
            }
            else {
                log("Could not get <progress> of ProgressViewer", this.dialog);
            }
        }
        else {
            log("Could not get window of ProgressViewer", this.dialog);
        }
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
        const pv = null;
        base.closest("form")!.querySelectorAll<HTMLInputElement>('.module-list ul li').forEach(async li => {
            const moduleName = li.dataset.moduleName!;
            let module = this.appData.assetMapping.getModule(moduleName);
            if(module === undefined) {
                module = await this.appData.reindexModule(moduleName, pv);
            }
            else {
                if(Object.keys(module.packs).length === 0) {
                    module = await this.appData.reindexModule(moduleName, pv);
                }
            }

            let hasScene: boolean = this.appData.assetMapping.assetCountInModule(module) !== 0;
            li.classList.remove("unkown-scene-status");
            li.classList.toggle("has-scene", hasScene);
            li.classList.toggle("no-scene", !hasScene);
        });
    }

    activateListeners(html: JQuery<HTMLElement>) {
        super.activateListeners(html);
        const win = html[0];
        assert(win != undefined);
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
    finished: boolean,
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
        const win = html[0];
        assert(win != undefined);
        addControls(win);
    }
});
