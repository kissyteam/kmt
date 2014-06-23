module.exports = (function (undefined) {

    var self = this,
        S;

    S = {

        Env: {
            host: self,
            mods: {}
        },

        Config: {
            debug: false,
            packages: {},
            fns: {}
        },

        config: function (configName, configValue) {
            var cfg,
                r,
                self = this,
                fn,
                Config = S.Config,
                configFns = Config.fns;
            if (typeof configName === 'string') {

                cfg = configFns[configName];
                if (configValue === undefined) {
                    if (cfg) {
                        r = cfg.call(self);
                    } else {
                        r = Config[configName];
                    }
                } else {
                    if (cfg) {
                        r = cfg.call(self, configValue);
                    } else {
                        Config[configName] = configValue;
                    }
                }
            } else {
                for (var p in configName) {
                    configValue = configName[p];
                    fn = configFns[p];
                    if (fn) {
                        fn.call(self, configValue);
                    } else {
                        Config[p] = configValue;
                    }
                }
            }
            return r;
        }
    };

    var Loader = S.Loader = {};


    Loader.Status = {
        /** error */
        ERROR: -1,
        /** init */
        INIT: 0,
        /** loading */
        LOADING: 1,
        /** loaded */
        LOADED: 2,
        /** attaching */
        ATTACHING: 3,
        /** attached */
        ATTACHED: 4
    };

    "logger,loader-utils,package,loader,config,combo-loader,init,base,util".split(",").map(function(mod) {
        mod = mod.trim();
        if(mod) {
            return require("./"+mod);
        }
    }).map(function(mod){
        mod(S);
    });

    return S;

})();