require("source-map-support").install();

import {lib} from "./rally-tools.js";
import {cached} from "./decorators.js";

export {default as SupplyChain} from "./supply-chain.js";
export {default as Preset} from "./preset.js";
export {default as Rule} from "./rule.js";
export {default as Provider} from "./providers.js";
export {default as Notification} from "./notification.js";

export * from "./rally-tools.js";

export const rallyFunctions = {
    async bestPagintation(){
        global.silentAPI = true;
        for(let i = 10; i <= 30; i+=5){
            console.time("test with " + i);
            let dl = await lib.indexPathFast("DEV", `/workflowRules?page=1p${i}`);
            console.timeEnd("test with " + i);
        }
    },
    async uploadPresets(env, presets, createFunc = ()=>false){
        for(let preset of presets){
            await preset.uploadCodeToEnv(env, createFunc);
        }
    },
    //Dummy test access
    async testAccess(env){
        if(lib.isLocalEnv(env)){
            //TODO
            return true;
        }
        let result = await lib.makeAPIRequest({env, path: "/providers?page=1p1", fullResponse: true});
        return result.statusCode;
    },
}
