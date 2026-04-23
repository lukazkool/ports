const fs = require("fs");

const INPUT = "runner.js";
const OUTPUT = "runner.patched.js";

let code = fs.readFileSync(INPUT, "utf8");

if (code.includes("GX MINIMAL PATCH")) {
    console.log("⚠️ Already patched.");
    process.exit(0);
}

// --------------------------------------------------
// 1. Fix known GX opcode crash (safe, exact match)
// --------------------------------------------------
code = code.replace(
    /1570469\s*:\s*a\s*=>\s*\{\s*setAddAsyncMethod\(a\)\s*\}/,
    `1570469:a=>{
        console.warn("[PATCH] setAddAsyncMethod ignored");
    }`
);

// --------------------------------------------------
// 2. Inject EARLY stubs (before engine runs)
// --------------------------------------------------
code = code.replace(
    /var k;\s*/,
`var k;

// ===== GX MINIMAL PATCH (EARLY STUBS) =====
window.setAddAsyncMethod = function(){
    console.warn("[PATCH] setAddAsyncMethod stubbed");
};

window.g_pWadLoadCallback = function(){};

window.setWadLoadCallback = function(fn){
    window.g_pWadLoadCallback = fn || function(){};
};
`
);

// --------------------------------------------------
// 3. Patch gmdebug WebSocket ONLY
// --------------------------------------------------
code = code.replace(
    /new WebSocket\(([^)]+)\)/g,
    `(function(url, protocols){
        if (typeof url === "string" && url.indexOf("gmdebug") !== -1) {
            console.warn("[PATCH] Blocked gmdebug WebSocket:", url);
            return {
                readyState: 3,
                send: function(){},
                close: function(){},
                addEventListener: function(){},
                removeEventListener: function(){}
            };
        }
        return new WebSocket(url, protocols);
    })($1)`
);

// --------------------------------------------------
// 4. Append SAFE runtime overrides (no file changes)
// --------------------------------------------------
const patch = `

// ===== GX MINIMAL PATCH (RUNTIME) =====
(function(){

    console.log("[PATCH] Applying minimal GX/runtime fixes");

    try { window.oprt = undefined; } catch(e){}

    // Disable GX networking (safe no-ops)
    window.gxc_request_room = () => {};
    window.gxc_join_room = () => {};
    window.gxc_set_player_status = () => {};
    window.gxc_report_status = () => {};
    window.gxc_get_player_info = () => {};
    window.gxc_receive_chat_message = () => {};

    window.webtransport_set_relay = () => {};
    window.webtransport_destroy = () => {};
    window.webtransport_send = () => {};
    window.webtransport_receive = () => {};

    function apply(){

        if (typeof doGMLCallback !== "undefined") {
            doGMLCallback = function(){};
        }

        if (typeof OGX_startDRMCheck !== "undefined") {
            OGX_startDRMCheck = function(){};
        }

        if (typeof GM_is_multiplayer !== "undefined") {
            GM_is_multiplayer = function(){ return 0; };
        }

        console.log("[PATCH] Runtime overrides applied");
    }

    let tries = 0;
    const t = setInterval(()=>{
        tries++;
        try {
            apply();
            clearInterval(t);
        } catch(e){
            if (tries > 10) clearInterval(t);
        }
    }, 50);

})();
`;

code += "\n" + patch;

// --------------------------------------------------
fs.writeFileSync(OUTPUT, code);
console.log("✅ Minimal patched file created:", OUTPUT);