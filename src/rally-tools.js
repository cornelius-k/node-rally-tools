import chalk from "chalk";
import {configObject} from "./config.js";
const rp = importLazy("request-promise")

global.chalk = chalk;
global.log = text => console.log(text);
global.write = text => process.stdout.write(text);
global.errorLog = text => log(chalk.red(text));


export class lib{
    static async makeAPIRequest({env, path, path_full, payload, body, json = true, method = "GET", qs, headers = {}, fullResponse = false}){
        //Keys are defined in enviornment variables
        let config = configObject?.api?.[env];
        if(!config) {
            throw new UnconfiguredEnvError(env);
        };
        //Protect PROD and UAT(?) if the --no-protect flag was not set.
        if(method !== "GET" && !configObject.dangerModify){
            if(env === "UAT" && config.restrictUAT || env === "PROD"){
                throw new ProtectedEnvError(env);
            }
        }


        let rally_api_key = config.key;
        let rally_api = config.url;


        path = path_full || rally_api + path;
        body = body || payload && JSON.stringify(payload);

        if(global.logAPI){
            log(chalk`${method} @ ${path}`);
            if(qs){
                log(qs)
            }
        }
        if(payload){
            headers["Content-Type"] = "application/vnd.api+json";
        }

        let requestOptions = {
            method, body, qs, uri: path,
            auth: {bearer: rally_api_key},
            headers: {
                Accept: "application/vnd.api+json",
                ...headers,
            },
            simple: false, resolveWithFullResponse: true,
        };
        let response = await rp(requestOptions);

        if(!fullResponse && ![200, 201, 204].includes(response.statusCode)){
            throw new APIError(response, requestOptions);
        }
        if(fullResponse){
            return response;
        }else if(json){
            return JSON.parse(response.body);
        }else{
            return response.body;
        }
    }
    //Index a json endpoint that returns a {links} field.
    static async indexPath(env, path){
        let all = [];

        let json = await this.makeAPIRequest({env, path});

        let [numPages, pageSize] = this.numPages(json.links.last);
        //log(`num pages: ${numPages} * ${pageSize}`);

        all = [...json.data];
        while(json.links.next){
            json = await this.makeAPIRequest({env, path_full: json.links.next});
            all = [...all, ...json.data];
        }

        return all;
    }

    //Returns number of pages and pagination size
    static numPages(str){
        return /page=(\d+)p(\d+)/.exec(str).slice(1);
    }

    //Index a json endpoint that returns a {links} field.
    //
    //This function is faster than indexPath because it can guess the pages it
    //needs to retreive so that it can request all assets at once.
    //
    //This function assumes that the content from the inital request is the
    //first page, so starting on another page may cause issues. Consider
    //indexPath for that.
    static async indexPathFast(env, path){
        let all = [];

        let json = await this.makeAPIRequest({env, path});
        let baselink = json.links.first;
        const linkToPage = page => baselink.replace("page=1p", `page=${page}p`);

        let [numPages, pageSize] = this.numPages(json.links.last);
        //log(`num pages: ${numPages} * ${pageSize}`);

        //Construct an array of all the requests that are done simultanously.
        //Assume that the content from the inital request is the first page.
        let promises = [Promise.resolve(json),];
        for(let i = 2; i <= numPages; i++){
            let req = this.makeAPIRequest({env, path_full: linkToPage(i)});
            promises.push(req);
        }

        for(let promise of promises){
            all = [...all, ...(await promise).data];
        }

        return all;
    }
    static isLocalEnv(env){
        return !env || env === "LOCAL" || env === "LOC";
    }
};

export class AbortError extends Error{
    constructor(message){
        super(message);
        Error.captureStackTrace(this, this.constructor);
        this.name = "AbortError";
    }
}

export class APIError extends Error{
    constructor(response, opts){
        super(chalk`
{reset Request returned} {yellow ${response.statusCode}}{
{green ${JSON.stringify(opts)}}
{reset ${response.body}}
        `);
        Error.captureStackTrace(this, this.constructor);
        this.name = "ApiError";
    }
}

export class UnconfiguredEnvError extends AbortError{
    constructor(env){
        super("Unconfigured enviornment: " + env);
        this.name = "Unconfigured Env Error";
    }
}

export class ProtectedEnvError extends AbortError{
    constructor(env){
        super("Protected enviornment: " + env);
        this.name = "Protected Env Error";
    }
}

export class Collection{
    constructor(arr){
        this.arr = arr;
    }
    [Symbol.iterator](){
        return this.arr[Symbol.iterator]();
    }
    findById(id){
        return this.arr.find(x => x.id == id);
    }
    findByName(name){
        return this.arr.find(x => x.name == name);
    }
    findByNameContains(name){
        return this.arr.find(x => x.name.includes(name));
    }
    log(){
        for(let d of this) log(d.chalkPrint(true));
    }
    get length(){return this.arr.length;}
}


export class RallyBase{
    constructor(){}
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
}
