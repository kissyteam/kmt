var tool = require("./tool"),
    log = tool.log,
    util = require("util"),
    path = require("path"),
    fs = require("fs"),
    UglifyJS = require("uglify-js"),
    walk = require('walk'),
    S = require("./loader/seed"),
    _ = require("underscore");

var reCommentRecover = /\/\*\$comment(\d+)\$\*\//g;
    reKISSY = /(?:KISSY|S)[\r\n\s]*\.[\r\n\s]*add/,

    specialString = [
       [ /'\/\/'/g , '"//"' ]
    ];


function Parser(source, options) {
    this.source = source;
    this.options = options || {};
    this.init();
}


var count = 0,
    NO_METHOD = "NO_METHOD",
    requiresValue = {},
    replaceMap = {};

function replaceCode(code,len) {
    count = count+1;
    var index = count.toString(),
        z = len -1 - index.length;

    index = new Array(z+1).join(0) + index;
    replaceMap[index] = code;
    return '$'+index;
}

Parser.prototype = {
    init: function() {
        this._code = [];
        this.comments  = {};
        this.useStrict = false;
        this.moduleName = "";
        this.args = [];
        this.requires = [];
        if(this.options.file) {
            if(path.extname(this.options.file) !==".js"){
                return;
            }
        }
        this.preParser().toCommonJs();

    },

    toCommonJs:function() {
        //先转换成commonJs风格代码
        var _node,
            source = this.source;
        //console.log(source);
        try{
            tool.parseCode(source, function(node) {
                        if( node instanceof UglifyJS.AST_Call){
                              if(tool.isCallKISSYAdd(node)) {
                                  var root = this.find_parent(UglifyJS.AST_Call);

                                  if(root && root !== node){
                                      //查找最外层的KISSY.ADD;
                                      var isDescend = this.stack.some(function(_node){
                                         return _node !== node && tool.isCallKISSYAdd(_node);
                                      });
                                      if(isDescend){
                                          return true;
                                      }

                                  }else{
                                      _node = node;
                                  }
                              }
                        }
                    });
        }catch(err) {
            //console.log(err);
        }


        if(_node) {
            this.parseCommonJsNode(_node);
        }else {
            //可能已经是commonJs风格
        }

    },

    parseCommonJsNode: function(node) {

            var self = this,
                source = this.source,
                factory,
                deps,
                args = node.args,
                len = args.length,

                requires ,
                __code = [],
                factoryArgs = [],
                factoryBody = [];

            var temp = source.substring(0,node.start.pos).trim();
            if(temp) {
                __code.push('/*'+ temp.replace(/^\/\*/,"").replace(/\*\/$/,"") +'*/\n');
            }


            if(len ==1) {
                // factory
                factory =args[0];
            }
            if(len == 2) {
                // factory,deps
                factory = args[0];
                deps =  args[len-1];

                if(factory.start.type == "string") {
                    self.moduleName = factory.start.value;
                    factory = deps;
                    deps = null;
                }

            }
            if(args.length == 3) {
                // name,factory,deps
                self.moduleName = args[0].value;
                factory = args[1];
                deps = args[len-1];
            }

            if(deps) {
                requires = source.substring(deps.start.pos,deps.end.pos+1);
            }

            if(factory.start.type == "keyword" && factory.start.value == "function") {

                if(factory.argnames && factory.argnames.length) {
                    factory.argnames.forEach(function(arg) {
                        factoryArgs.push(arg.name);
                    });
                }
                factoryArgs =self.args.concat(factoryArgs.splice(1));


                self.arg = factoryArgs;

                var _code = [];
                if(requires) {

                    requires = requires.substring(requires.indexOf("[")+1, requires.indexOf("]")).split(",")
                                        .map(function(item) {
                                           return tool.stripQuote(item);
                                        });
                }
                requires = requires || [];
                if(factoryArgs.length && factoryArgs[0] == "require" && requires.length ==0 ) {
                    //已经是commonJS风格代码
//                    var body = factory.body;
//                    self.commonJsCode = source.substring(body[0].start.pos, body[body.length-1].end.endpos);
//                    self.upgrade();
//                    return;
                }else {
                    self.requires = self.requires.concat(requires);
                    self.requires.forEach(function(require, index) {
                        if(!require) {
                            return;
                        }
                        if(factoryArgs && factoryArgs[index]) {
                            _code.push(util.format("\tvar %s = require('%s');", factoryArgs[index], require));
                        }else {
                            _code.push(util.format("\trequire('%s');",require));
                        }
                    });

                    if(_code.length) {
                        _code = _code.join("\n") ;
                        factoryBody.push(_code);
                    }
                }




                if(factory.body && factory.body.length) {
                    var last;
                    factory.body.forEach(function(body) {
                        if(last) {
                            var comment = source.substring(last, body.start.pos);
                            if(comment) {
                                factoryBody.push(comment.trim());
                            }
                        }
                        last = body.end.endpos;
                        if (body.start.type == "keyword" && body.start.value == "return") {
                            factoryBody.push("\n\tmodule.exports = " + source.substring(body.start.endpos, body.end.endpos));
                        }else{
                            factoryBody.push("\t"+source.substring(body.start.pos, body.end.endpos));
                        }
                    });

                }
            }else{
                //factory 不是构造函数
                factoryBody.push("\tmodule.exports = " + source.substring(factory.start.pos, factory.end.endpos));
            }


            var code = factoryBody.join("\n"),
                self = this;



            if(code.search(/'use\s+strict'[\r\n\s]*;/) > -1) {
                self.useStrict = true;
                code = code.replace(/'use\s+strict'[\r\n\s]*;/,"");
            }

            __code.push(code);
            var temp = source.substring(node.end.endpos+1).trim();
            if(temp) {
                __code.push('/*'+ temp.replace(/^\/\*/,"").replace(/\*\/$/,"") +'*/');
            }

            this.commonJsCode =  __code.join("\n");
            this.upgrade();
    },

    push: function(code) {
        this._code.push(code);
        return this;
    },

    parseComment: function() {
        var self = this;
        return tool.stripComment(this.source, function(comment) {
                    var id = Math.random().toString().split(".")[1] + Date.now();
                    self.comments[id] = comment;
                    //self.source = self.source.replace(comment,util.format('{comment:comment(/*$comment%s$*/)},',id));
               });
    },

    recoverComment: function() {
        var self = this;
        this.source = this.source.replace(reCommentRecover, function(match, id) {
            if(self.comments[id]) {
                return self.comments[id];
            }
            return match;
        });
        return this;
    },

    preParser: function() {
        var self = this;

        var code = this.source;

        console.log(tool.stripComment(code).split(reKISSY).length);
        specialString.forEach(function(item) {
            self.source = self.source.replace(item[0],item[1]);
        });

        this.parseComment();

        return this;
    },

    //升级至KISSY1.5
    upgrade: function() {
        this.source = this.commonJsCode;
        var self = this,
            _node,
            extra = 0,
            source = this.commonJsCode,
            _source = source;

        this.variables = [];

        var variable = [],
            variables = this.variables,
            variablevalue = [],
            inline_requires = {},
            args = [],
            _requires = [],
            requires = [];

        var map = {
                "param":"querystring.stringify",
                "unparam":"querystring.parse",
                "path":"path",
                "all":"node.all",
                "one":"node.one"
            },
            useMap = {
                "event":"event/dom",
                "dom":"dom/base"
            };


        try{
            tool.parseCode(source, function(node) {
                S.use("util", function(S,util){

                            if( node instanceof UglifyJS.AST_Call){
                                //KISSY 方法调用
                                if(/KISSY|S/.test(node.start.value)) {

                                    var method = node.expression && node.expression.property;
                                    if(S[method]){

                                    }else if(util[method]) {
                                        if(args.indexOf("util") == -1) {
                                            args.push("util");
                                            requires.push("util");
                                        }
                                        var call = source.substring(node.start.pos,node.expression.end.endpos);
                                        var temp = replaceCode('#util.'+method+'#',call.length),
                                            prev = self.source.substring(0,node.start.pos),
                                            next = self.source.substring(node.expression.end.endpos);

                                        self.source = prev+temp+next;

                                    }else if(map[method]){

                                        var s = map[method].split(".");
                                        if(s.length == 1) {
                                            if(args.indexOf(s[0]) == -1) {
                                                args.unshift(s[0]);
                                                requires.unshift(s[0]);
                                            }
                                        }else if(s.length ==2 ){
                                            if(args.indexOf(s[0]) == -1) {
                                                args.unshift(s[0]);
                                                requires.unshift(s[0]);
                                            }
                                        }
                                        if(method == 'param' || method == "unparam") {
                                            //querystring
                                            var call = source.substring(node.start.pos,node.expression.end.endpos);
                                            var temp = replaceCode('#querystring.'+ (method == "param" ? "stringify":"parse") +'#', call.length),
                                                prev = self.source.substring(0,node.start.pos),
                                                next = self.source.substring(node.expression.end.endpos);
                                            self.source = prev + temp + next;

                                        }

                                    }
                                }else if(node.start.value == 'require') {
                                      if(node.args && node.args.length == 1) {
                                          var module = node.args[0].value.trim();
                                          _requires.push({
                                                pos:node.args[0].start.pos,
                                                module:module
                                          });
                                      }
                                }
                            }else if(node instanceof UglifyJS.AST_PropAccess) {
                                    //属性访问
                                    if(/KISSY|S/.test(node.start.value)) {

                                        var method = node.property;
                                        if(method) {
                                            if(node.expression) {
                                                if(node.expression.start.value == node.expression.end.value) {

                                                    if(["UA","Path","all","one"].indexOf(method) >-1) {

                                                        if(args.indexOf(method) == -1) {

                                                            var r = "";
                                                            if(method == "UA") {
                                                                r = "ua";
                                                            }else if(method == "Path") {
                                                                r = "path";
                                                            }else{
                                                                r= "node";
                                                            }
                                                            args.push(method);
                                                            requires.push(r);
                                                        }

                                                        var call = source.substring(node.start.pos,node.end.endpos);
                                                        var _method = NO_METHOD;
                                                        if(method == "all" || method == "one") {
                                                            _method = method;
                                                            method =  "node";
                                                        }
                                                        var temp = replaceCode('#'+ method+'.'+ _method +'#', call.length);
                                                        self.replace(node.start.pos, node.end.endpos, temp);
                                                    }
                                                }
                                            }
                                        }
                                    }else {
                                        if(node.end && node.end.value == "Target") {
                                            //初步判断可能存在event.target;
                                            var index = variable.indexOf(node.start.value);
                                            if(index>-1) {
                                                var result = self.getVariable(variable[index]);
                                                if(result.value.indexOf("event")) {
                                                    //有使用到event target对象
                                                }
                                            }
                                        }
                                    }
                                }else if(node instanceof UglifyJS.AST_Definitions) {
                                    if(node.definitions.length){
                                        node.definitions.map(function(item) {
                                            if(!item.value) {
                                                return;
                                            }
                                            if(item.value.start.value == "require") {
                                                var arg = item.value.args[0];
                                                if(arg && arg.value == "event") {
                                                    self.replace(arg.start.pos, arg.end.endpos, replaceCode("'event/dom'", 7));
                                                }
                                                inline_requires[arg.value] = item.name.name;
                                            }
                                            variable.push(item.name.name);

                                            var value = source.substring(item.value.start.pos, item.value.end.endpos);
                                            value = value.replace(/\$(\d+)/g, function(all, match){
                                                        return replaceMap[match];
                                                    });
                                            variablevalue.push(value);

                                            variables.push({
                                                key:item.name.name,
                                                value:value,
                                                type:(function(){
                                                    var node = item.value;
                                                    if(node.start.type == "name") {
                                                        return node.end.type == "name"? "variable":"func";
                                                    }
                                                    return "const";
                                                })()
                                            })
                                        });
                                    }
                                }
                     });
            });
        }  catch(err){
            if(self.options.file) {
                err = util.format("file:%s\n%s",self.options.file, err);
            }
            log.error(err);
            self.push(source);
        }

        var argsMap = {};
        args = args.map(function(arg) {
            var _arg = arg;
            while(variable.indexOf(arg)>-1) {
                arg =  '_'+arg;
            }
            argsMap[_arg] = arg;
            return arg;
        });
        this.argsMap =argsMap;
        this.args = args;

        var _code = [];
        requires.forEach(function(require, index) {
            if(!require) {
                return;
            }
            if(args && args[index]) {
                _code.push(util.format("\tvar %s = require('%s');", args[index], require));
            }else {
                _code.push(util.format("\trequire('%s');",require));
            }
        });

        if(_code.length) {
            _code = _code.join("\n");
            this.source = _code+'\n'+this.source;
        }

        this.source = this.source.replace(/\$(\d+)/g, function(all,match) {
            return replaceMap[match];
        });

        this.source = this.source.replace(/#([\w/]+)\.(\w+)#/g, function(all,host, method) {
            return self.argsMap[host]+ (method == NO_METHOD?"":"."+method);
        });
        if(this.useStrict) {
            this.source  = "\t'use strict';\n" +  this.source;
        }
        //console.log(this.source);
        return this;
    },

    getVariable: function(key){
        var variable = {},
            has_fun = false;
            _index = 0;

        var variables = this.variables;

        do {

            variables.forEach(function(_variable,index) {

                if(_variable.key == key) {
                    variable = _variable;
                    key = variable.value;
                    variables.splice(index,1);
                    return false;
                }
                return true;
            });
            if (variable.type == "const"){
                break;
            }
        }while(variable  && variable.type != "func")
        return variable;
    },
    replace: function(start, end, code) {
        var prev = this.source.substring(0,start),
            next = this.source.substring(end);

        this.source = prev + code + next;
    },

    sub: function(start,end) {
        return this.source.substring(start, end);
    },

    end: function() {
        var self = this;
        this.source = this._code.join("\n");
        this.recoverComment();
        this.source = this.source.trim();

        this.comments = {};
    },

};


var defaultOptions = {
    fromString: false,
    ignoreFiles: '-min.js',
    filters: /[\/]+\.\w+/
}

function build(options) {
    var options = _.extend({},defaultOptions, options),
        sourcePath = options.src,
        buildPath = options.dest;


    options.filters = tool.makeArray(options.filters);
    options.ignoreFiles = tool.makeArray(options.ignoreFiles);

    walk.walk(sourcePath, {
                    followLinks: false,
                    filters: options.filters
                 }
        )
        .on("file", function (root, fileStats, next) {
            var file = path.join(root,fileStats.name);
            var relative = file.replace(sourcePath,"").trim();

            var ignore = options.ignoreFiles && options.ignoreFiles.some(function (filter) {
              if (fileStats.name.match(filter)) {
                return true;
              }
            });

            if(ignore) {
                return next();
            }
            if(relative ) {
                var content = fs.readFileSync(file).toString(),
                    buildFile = path.join(buildPath,relative),
                    dirpath = path.dirname(buildFile);

                if(path.extname(file) == ".js") {
                    options.file = file;
                    options.kissy5 = options.v == 'k5';
                    content = new Parser(content, options).source;
                }
                if(options.stdout) {
                    log.info("building ",file);
                }


                tool.write(buildFile, content);
                if(options.stdout) {
                    log.info("%s is build successfully!", relative);
                }
            }
            next();
        }).on("end", function() {
            log.info("build done!");
        });
}


module.exports = {
    parse:function(input,options) {
       var options = _.extend({}, defaultOptions, options),
           code = input;

       if(!options.fromString) {
           if(fs.existsSync(input)) {
               code = fs.readFileSync(input).toString();
           }else {
               return null;
           }
       }

       return new Parser(code, options).source;
    },
    build:build,
    test:function(){
        this.parse.apply(this,arguments);
    }
}
