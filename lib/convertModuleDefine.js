var esprima = require('esprima'),
    defaultOptions = require('./defaultOptions');

var factory_params = esprima.parse((function a(S ,require, exports, module){}).toString(),defaultOptions.esprima).body[0].params;


module.exports = function(node, options){
    var moduleName, dependencies = [], params = [], factory , hasRequire = false;
    options = options || {};
    var args = node.arguments;

    if(args.length == 1 && args[0].type != 'FunctionExpression') {
        factory = args[0];
    }else {
        node.arguments = args.map(function(arg){
                               var type = arg.type;
                               if(type == 'ArrayExpression') {
                                    dependencies = arg.elements.map(function(element){
                                                        return element.value;
                                                    });
                                    arg.index = 2;

                               }else if(type == 'FunctionExpression') {
                                     params = arg.params.slice(1).map(function(param){
                                                 return param.name;
                                              });

                                     if(params[0] == 'require') {
                                        hasRequire = true;
                                     }
                                     arg.params = options.modulex ? factory_params.slice(1): factory_params;
                                     factory = arg;
                                     arg.index = 3;

                               }else if(type == 'ObjectExpression'){
                                    arg.properties.forEach(function(property){

                                        if(property.key.value == 'requires' || property.key.name == 'requires') {
                                            hasRequire = false;
                                            dependencies = property.value.elements.map(function(element, index){
                                                                var value = element.value;
                                                                if(value == 'ua') {
                                                                    params[index] = params[index]|| 'UA';
                                                                }
                                                                return value;
                                                           });
                                            return false;
                                        }
                                    });
                                    arg = esprima.parse(JSON.stringify(dependencies), defaultOptions.esprima).body[0].expression;
                                    arg.index = 2;
                               }else if(type == 'Literal') {
                                    moduleName = arg.value;
                                    arg.index = 1;
                               }
                               return arg;
                            })
                        .sort(function(a,b){
                            return a.index - b.index;
                        });

    }

    if(!moduleName) {
        //没有模块名称，去掉依赖
        node.arguments = node.arguments.slice(-1);
    }

    if(options.modulex) {
        node.callee.object.name = 'modulex';
    }

    return {
        node: node,
        moduleName: moduleName,
        dependencies: dependencies,
        factory: factory,
        params: params,
        require: hasRequire,
        requires:{},
        unknown_api:[], //不存在的api
        deprecated_api: [] //被废弃的api
    }
}