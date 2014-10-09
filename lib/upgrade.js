var esprima = require('esprima'),
    estraverse = require('estraverse'),
    defaultOptions = require('./defaultOptions'),
    utils = require('./utils');

var utilMethods = ["mix", "guid", "indexOf", "lastIndexOf", "unique", "inArray", "filter", "map", "reduce", "every", "some", "makeArray", "escapeHtml", "escapeRegExp", "unEscapeHtml", "escapeHTML", "unEscapeHTML", "noop", "bind", "rbind", "later", "throttle", "buffer", "equals", "keys", "each", "now", "isEmptyObject", "stamp", "merge", "augment", "extend", "namespace", "clone", "startsWith", "endsWith", "trim", "urlEncode", "urlDecode", "camelCase", "substitute", "ucfirst", "type", "isPlainObject", "isBoolean", "isNumber", "isString", "isFunction", "isDate", "isRegExp", "isObject", "isArray", "parseJson", "isWindow", "parseXml", "globalEval", "ready", "available", "parseXML"],
    deprecatedMethods = ["isNull", "isUndefined", "equals", "fromUnicode"],
    eventMethods = ["add", "remove", "on", "detach", "delegate", "undelegate", "fire", "fireHandler", "clone", "getEventListeners"],
    eventProperties = ["Target", "global"],
    modulexMethods = ["Env", "Config", "version", "config", "Loader", "getScript", "getModule", "getPackage", "add", "use", "require", "undef"];


var alias = {
        'node' : '$',
        'json' : 'JSON',
        'ua'   : 'UA',
        'io'   : 'IO'
    },
    moduleMap = {
        'node' : 'node',
        'Node' : 'node',
        'DOM'  : 'dom',
        'Anim' : 'anim',
        'JSON' : 'json',
        'Cookie':'cookie',
        'UA' :'ua',
        'Ajax': 'io',
        'io': 'io',
        'IO':'io',
        'json':'json',
        'Base':'base',
        'Event': 'event',
        'Overlay':'overlay',
        'Dialog':'overlay',
        'Popup': 'overlay',
        'Features':'feature',
        'Promise' :'promise',
        'Defer' :'promise',
        'Uri':'uri'
    };

function addModule(moduleName, node, moduleInfo) {
    var index = moduleInfo.dependencies.indexOf(moduleName),
        name = utils.encodeVariableName(alias[moduleName]||moduleName),
        params = moduleInfo.params,
        call = name;

    if(index == -1) {
        moduleInfo.dependencies.unshift(moduleName);
        params.unshift(name);
    }else {
        moduleInfo.params[index] = moduleInfo.params[index] || name;
        call = params[index];
    }

    node.type = "Identifier";
    node.name = call;
}


function directCall(name, node, moduleInfo, parent) {
    if(!name) {
        return node;
    }
    var callee = node.callee,
        moduleName,
        _node = callee;

    if(name == 'use') {
        var dependencies = [];
        node.arguments = node.arguments.map(function(arg){
            if(arg.type == 'Literal') {
                dependencies = arg.value.split(",");
                return esprima.parse(JSON.stringify(dependencies), defaultOptions.esprima).body[0].expression;
            }else if(arg.type == "FunctionExpression") {
                arg.params = arg.params.slice(1);
                //可能是KISSY1.4以下版本代码
                if(arg.params.length !=dependencies.length) {
                    estraverse.traverse(arg, {
                        enter: function(_node,_parent) {
                            if(_node.type == 'CallExpression' || _node.type == 'NewExpression') {
                                var _callee = _node.callee,
                                    _object = _callee.object;

                                if(_object && utils.isKISSY(_object.name||_object.object.name)) {
                                    var _name = _callee.property.name,
                                        index = dependencies.indexOf(_name.toLowerCase());
                                    if(index>-1) {
                                        arg.params[index] = arg.params[index] || esprima.parse(_name, defaultOptions.esprima).body[0].expression;
                                        _node.callee = _callee.property;
                                    }
                                }
                            }
                        }
                    })
                }
            }
            return arg;
        });

        callee.name = 'require';
        callee.type = 'Identifier';
        return node;
    }

    if(deprecatedMethods.indexOf(name)>-1) {
         var message = utils.substitute("//废弃的方法{name},KISSY5.0已经不再支持!",{name:name});
         callee.property.name = name + "_deprecated_api";
         moduleInfo.deprecated_api.push(name);
         return node;
    }

    if(utilMethods.indexOf(name)>-1) {
        moduleName = 'util';
        _node = callee.object;

    }else if(["one","all","Node"].indexOf(name)>-1){
        moduleName = 'node';
        if(name != 'Node') {
            _node = callee.object;
        }
    }else if(['Popup','Dialog'].indexOf(name)>-1) {
        _node = callee.object;
    }else if(name == 'Defer') {
        _node = callee.object;
    }else if(name == 'execScript') {
        moduleName = 'util';
        _node = callee.object;
        callee.property.name = 'globalEval';
    }

    if(!moduleName) {
        moduleName = moduleMap[name];
    }

    if(moduleName) {
        addModule(moduleName, _node, moduleInfo);
    }else{
        if(moduleInfo.options.modulex &&  modulexMethods.indexOf(name)>-1) {
            node.callee.object.name = 'modulex';
        }else {
            if(console[name]) {
                node.callee.object.name = 'console';
            }else if(name == 'EventTarget') {
                node.callee.property.name = 'Target';
                addModule('event',node.callee.object, moduleInfo);
            }else if(name == 'Date') {
                //warn
            }else if(name == 'param' || name == 'unparam'){
                callee.property.name = name == 'param'?'stringify':'parse';
                addModule('querystring',callee.object, moduleInfo);
            }else if(name == 'get' || name == 'query') {
                addModule('dom', callee.object, moduleInfo);
            }else if(name == 'NodeList') {
                addModule('node', callee, moduleInfo);
            }else if(name.indexOf('deprecated_api')>-1 || name.indexOf('_unknown_api')>-1) {
                return node;
            }else {
                if(parent.type == 'AssignmentExpression') {
                    utils.remove(parent);
                }else {
                    if(name == 'add') {
                        return node;
                    }else if(name == 'require') {
                        callee.type = "Identifier";
                        callee.name = name;
                        return node;
                    }

                    if(['Env','version','config'].indexOf(name)>-1 && callee.object) {
                        if(moduleInfo.options.modulex) {
                            callee.object.name = 'modulex';
                        }
                        return node;
                    }


                    callee.property.name = name +'_unknown_api';
                    moduleInfo.unknown_api.push(name);
                }
            }
        }
    }

    return node;
}

function indirectCall(name, node, moduleInfo, parent) {
    if(!name) {
        return node;
    }
    var callee = node.callee,
        moduleName = moduleMap[name],
        _node = callee.object;

    if(moduleName) {
        if(name == 'DOM') {
            callee.object.property.name = 'Dom';
        }else {
            if(name =='Node' && callee.property.name == 'create') {
                _node = callee;
            }
        }
        addModule(moduleName, _node, moduleInfo);
    }else{
        if(['call','apply'].indexOf(callee.property.name)>-1) {
            directCall(name, {
                callee: callee.object
            }, moduleInfo, parent);
        }else{
            console.log(moduleInfo.filename);
            console.log(name);
        }
    }

    return node;
}


//KISSY属性访问
function propertyAcess(name, node, moduleInfo, parent) {
    if(!name) {
        return node;
    }
    var _node = node.object;

    if(moduleMap[name]) {
        if(node.object.type == 'Identifier') {
            _node = node;
        }

        if(name == 'Promise') {
            _node = node;
        }
        addModule(moduleMap[name], _node, moduleInfo);
    }else{
        directCall(name, {callee:node}, moduleInfo, parent);
    }
    return node;
}


module.exports = exports = function(node, moduleInfo, parent) {
    node.parent = parent;
    var args =  [node, moduleInfo, parent];

    if(node.callee) {
        if(node.callee.object.type == 'Identifier') {
            args.unshift(node.callee.property.name)
            return directCall.apply(null, args);
        }
        args.unshift(node.callee.object.property.name);
        return indirectCall.apply(null, args);
    }

    if(node.object.type == 'Identifier') {
        args.unshift(node.property.name);
    }else{
        args.unshift(node.object.property.name);
    }
    return propertyAcess.apply(null, args);
}


//检测event模块，更加细粒化的载入
exports.fixEvent = function(ast, moduleInfo) {

    var params = moduleInfo.params,
        dependencies = moduleInfo.dependencies;


    var index = dependencies.indexOf('event');

    if(index>-1) {
        var domEvent = false,
            customEvent = false;
            key = params[index];

        estraverse.traverse(ast, {
            enter: function (node, parent) {
                if(node.type == 'CallExpression') {
                    var callee = node.callee;
                    if(callee.object && callee.object.name == key) {
                        if(eventMethods.indexOf(callee.property.name)>-1) {
                            domEvent = true;
                        }
                    }
                }else if(node.type == "MemberExpression" && node.object && node.object.name == key) {
                    if(eventProperties.indexOf(node.property.name)>-1) {
                        customEvent = true;
                    }
                }
            }
        });

        var event_module = 'event';

        if(domEvent && !customEvent) {
            event_module = 'event-dom';
        }else if(!domEvent && customEvent) {
            event_module = 'event-custom';
        }

        if(moduleInfo.require) {
             var r = moduleInfo.requires['event'];

             if(r) {
                moduleInfo.requires[event_module] = r;
                try{
                    r.node.arguments[0].value = event_module;
                }catch(e){
                }
             }
        }
        moduleInfo.dependencies[index] = event_module;
    }
    return this;
}

exports.fixRequire = function(ast, moduleInfo) {

    var declarations = [],
        factory = moduleInfo.factory,
        params = moduleInfo.params,
        dependencies = moduleInfo.dependencies;

    dependencies.forEach(function(dependency, index){
        var code;
        if(moduleInfo.require) {
            if(moduleInfo.requires[dependency]) {
                return;
            }
        }
        if(params[index]) {
            code = utils.substitute("var {key} = require('{value}');", {key:params[index], value:dependency});

        }else {
            code = utils.substitute("require('{value}');", {value:dependency});
        }

        _ast = esprima.parse(code, defaultOptions.esprima).body[0];
         if(moduleInfo.require) {
            moduleInfo[dependency] = {
                name: params[index],
                node: _ast
            }
         }
        declarations.push(_ast);
    });

    if(declarations.length) {
        factory.body.body = declarations.concat.apply(declarations, factory.body.body);
    }

    try{
        //更新依赖
        ast.body[0].expression.arguments.forEach(function(arg){
            if(arg.type == 'ArrayExpression') {
                arg.elements = esprima.parse(JSON.stringify(dependencies), defaultOptions.esprima).body[0].expression.elements;
            }
        });
    }catch(err){
        //console.log(err);
    }
    return this;
}


exports.fixExports = function(ast, moduleInfo) {
    var factory = moduleInfo.factory;
        exports_ast = esprima.parse('module.exports = 0;', defaultOptions.esprima).body[0];

    if(factory.type == 'FunctionExpression') {
        factory.body.body = factory.body.body.map(function(body){
            if(body.type == 'ReturnStatement'){
                exports_ast.expression.right = body.argument;
                return exports_ast;
            }
            return body;
        });
    }else {
        exports_ast.expression.right = JSON.parse(JSON.stringify(factory));
        factory.body = exports_ast;
    }

    return this;
}

exports.clean = function(ast, moduleInfo) {
    estraverse.traverse(ast,{
        enter: function(node,parent) {
            if(node.type == 'VariableDeclaration') {
                 var declarations = node.declarations;
                 if(declarations && declarations.length) {
                    declarations = declarations.filter(function(declaration){
                        if(declaration.id && declaration.init) {
                            return declaration.id &&declaration.id.name != declaration.init.name;
                        }
                        return true;
                    });

                    if(declarations.length == 0) {
                        utils.remove(node);
                    }
                 }
            }
        }
    });
    return this;
}