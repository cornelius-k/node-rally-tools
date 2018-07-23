import {cached, defineAssoc} from "./decorators.js";
import {lib, Collection} from  "./rally-tools.js";
import {configObject} from "./config.js";
import Preset from "./preset.js";
import Provider from "./providers.js";
import Notification from "./notification.js";

import fs from "fs";
import path from "path";

class Rule{
    constructor(data, remote){
        this.data = data;
        this.remote = remote;
        this.isGeneric = !this.remote;
    }
    cleanup(){
        for(let [key, val] of Object.entries(this.relationships)){
            if(val.data){
                if(val.data.id){
                    delete val.data.id;
                }else if(val.data[0]){
                    for(let x of val.data) delete x.id;
                }
            }
            delete val.links;
        }
        delete this.relationships.organization;
        delete this.data.id;
        delete this.data.links;
    }
    async save(){
        if(!this.isGeneric){
            await this.resolve();
        }

        this.cleanup();
        fs.writeFileSync(this.localpath, JSON.stringify(this.data, null, 4));
    }

    get localpath(){
        return path.join(configObject.repodir, this.name + ".json");
    }

    resolveApply(datum, dataObj){
        let obj = datum.findById(dataObj.id);
        if(obj){
            dataObj.name = obj.name
        }
        return obj;
    }
    resolveField(datum, name, isArray=false){
        let field = this.relationships[name];
        if(!field?.data) return;

        if(isArray){
            return field.data.map(o => this.resolveApply(datum, o));
        }else{
            return this.resolveApply(datum, field.data);
        }
    }

    async resolve(){
        let presets = await Preset.getPresets(this.remote);
        let rules = await Rule.getRules(this.remote);
        let providers = await Provider.getProviders(this.remote);
        let notifications = await Notification.getNotifications(this.remote);

        let preset  = this.resolveField(presets, "preset");
        let pNext   = this.resolveField(rules, "passNext");
        let eNext   = this.resolveField(rules, "errorNext");
        let proType = this.resolveField(providers, "providerType");

        let enterNotif = this.resolveField(notifications, "enterNotifications");
        let errorNotif = this.resolveField(notifications, "errorNotifications");
        let passNotif  = this.resolveField(notifications, "passNotifications");

        this.isGeneric = true;

        return {
            preset, proType,
            pNext, eNext,
            errorNotif, enterNotif, passNotif,
        };
    }

    chalkPrint(pad=true){
        let id = String("R-" + this.remote + "-" + this.id)
        if(pad) id = id.padStart(10);
        return chalk`{green ${id}}: {blue ${this.name}}`;
    }

    @cached static async getRules(env){
        let rules = await lib.indexPathFast(env, "/workflowRules?page=1p20");
        return new Collection(rules.map(data => new Rule(data, env)));
    }
}

defineAssoc(Rule, "name", "attributes.name");
defineAssoc(Rule, "id", "id");
defineAssoc(Rule, "relationships", "relationships");

export default Rule;
