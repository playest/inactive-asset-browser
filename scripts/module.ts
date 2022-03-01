// Set this variables as their initilized state, see doc of LenientGlobalVariableTypes for an explanation
interface LenientGlobalVariableTypes {
    game: never;
    socket: never;
    ui: never;
    canvas: never;
}

Hooks.once('init', async function() {

});

function isOfInterest(moduleName: string): boolean {
    return ["czepeku-maps-megapack"].includes(moduleName);
}

Hooks.once('ready', async function() {
    console.log("inactive-asset-browser started");
    let a = game.modules;
    for(const [name, module] of game.modules.entries()) {
        if(isOfInterest(name)) {
            for(const pack of module.packs) {
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
                            const fr = new FileReader();
                            const o = JSON.parse(line);
                            console.log(o);
                        }
                    }
                }
            }
        }
    }
});
