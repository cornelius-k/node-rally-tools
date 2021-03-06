import Rule from "./rule.js";
import Preset from "./preset.js";
import Provider from "./providers.js";
import Notification from "./notification.js";
import {Collection} from "./rally-tools.js";
import {configObject} from "./config.js";

import fs from "fs";

export default class SupplyChain{
    constructor(startingRule){
        this.startingRule = startingRule;
        this.remote = startingRule.remote;
    }
    async calculate(){
        write("Getting rules... ");
        this.allRules = await Rule.getRules(this.remote);
        log(this.allRules.length);

        write("Getting presets... ");
        this.allPresets = await Preset.getPresets(this.remote);
        log(this.allPresets.length);

        write("Getting providers... ");
        this.allProviders = await Provider.getProviders(this.remote);
        log(this.allProviders.length);

        write("Getting notifications... ");
        this.allNotifications = await Notification.getNotifications(this.remote);
        log(this.allNotifications.length);

        write("Downloading code... ");
        await Promise.all(this.allPresets.arr.map(obj => obj.downloadCode()));
        log("Done!");

        //fs.writeFileSync("test.json", JSON.stringify(this, null, 4))

        //Now we have everything we need to find a whole supply chain

        write("Calculating Supply chain... ");

        let allRuleNames = this.allRules.arr.map(x => x.name).filter(x => x.length >= 4);
        let allPresetNames = this.allPresets.arr.map(x => x.name).filter(x => x.length >= 4);
        let allNotifNames = this.allNotifications.arr.map(x => x.name).filter(x => x.length >= 4);
        let requiredNotifications = new Set();

        let ruleQueue = [this.startingRule];
        let presetQueue = [];
        for(let currentRule of ruleQueue){
            let {
                eNext, pNext, preset,
                passNotif, errorNotif, enterNotif
            } = await currentRule.resolve();

            requiredNotifications.add(passNotif);
            requiredNotifications.add(enterNotif);
            requiredNotifications.add(errorNotif);

            if(eNext && !ruleQueue.includes(eNext)) ruleQueue.push(eNext);
            if(pNext && !ruleQueue.includes(eNext)) ruleQueue.push(pNext);

            let neededPresets = preset.findStringsInCode(allPresetNames);
            neededPresets = neededPresets.map(x => this.allPresets.findByName(x));

            let neededRules = preset.findStringsInCode(allRuleNames);
            neededRules = neededRules.map(x => this.allRules.findByName(x));

            preset
                .findStringsInCode(allNotifNames)
                .map(str => this.allNotifications.findByName(str))
                .forEach(notif => requiredNotifications.add(notif));

            for(let p of neededPresets) if(!presetQueue.includes(p)) presetQueue.push(p);
            for(let p of neededRules)   if(!ruleQueue  .includes(p)) ruleQueue  .push(p);

            if(configObject.verbose){
                write(preset.chalkPrint(false));
                log(":");
                write("  Pass Next: "); if(pNext) write(pNext.chalkPrint(false)); else write("None");
                log("");
                write("  Err  Next: "); if(eNext) write(eNext.chalkPrint(false)); else write("None");
                log("");
                log("  Rules:");

                for(let p of neededRules) log("    " + p.chalkPrint(true));

                log("  Presets:");
                for(let p of neededPresets) log("    " + p.chalkPrint(true));

                log("\n");
            }
        }

        log("Done!")

        this.rules = new Collection(ruleQueue);
        this.presets = new Collection(presetQueue);
        requiredNotifications.delete(undefined);
        this.notifications = [...requiredNotifications];
    }
    async syncTo(env){
        for(let preset of this.presets){
            await preset.save(env);
        }
        for(let rule of this.rules){
            await rule.save(env);
        }
    }
}
