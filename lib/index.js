var esprima = require('esprima'),
    estraverse = require('estraverse'),
    escodegen = require('escodegen'),
    _ = require('underscore'),
    utils = require('./utils'),
    upgrade = require('./upgrade'),
    defaultOptions = require('./defaultOptions'),
    convertModuleDefine = require('./convertModuleDefine');

var _options = {
        modulex: true,
        commonJs: true
    }

function parse(code, options) {
    options = _.extend({},_options, options);
    options.type = options.type || utils.isValidModule(code);
    if(options.type == 1) {
        //commonJS风格，先转换成KISSY风格再进行下一步处理
        code = utils.substitute('KISSY.add(function(S, require, exports, module){{code}});',{code:code});
    }
    var ast = esprima.parse(code, defaultOptions.esprima),
        moduleInfo, variables = [];

    estraverse.replace(ast, {
        enter: function (node, parent) {
            //函数调用

            if(!moduleInfo && utils.isModuleAdd(node)) {
                moduleInfo = convertModuleDefine(node, options);
                moduleInfo.filename = options.filename;
                moduleInfo.options = options;
                return moduleInfo.node;
            }


            if (node.type == 'CallExpression' || node.type == 'NewExpression') {
                var callee = node.callee;

                if(callee.name == 'require') {
                    var args = node.arguments;
                    if(args.length == 1 && args[0].type == 'Literal') {
                        if(moduleInfo) {
                            if(parent.type == 'VariableDeclarator' && parent.id) {
                                if(parent.id.type == 'Identifier') {
                                    moduleInfo.dependencies.unshift(args[0].value);
                                    moduleInfo.params.unshift(parent.id.name);
                                    moduleInfo['requires'][args[0].value] = {
                                        name: parent.id.name,
                                        node: node
                                    }
                                }
                            }
                        }
                    }
                }

                if(!(callee && callee.object)) {
                    return node;
                }

                var object = callee.object;

                if(['Identifier','MemberExpression'].indexOf(object.type) == -1) {
                    return node;
                }

                if(utils.isKISSY(object.name||object.object.name)) {
                    return upgrade(node, moduleInfo, parent);
                }
            }else if(node.type == 'MemberExpression') {
                var object = node.object;

                if(object.type == 'MemberExpression' && utils.isKISSY(object.object.name)) {
                    //S.UA.ie
                    return upgrade(node, moduleInfo, parent);
                }else if(object.type =='Identifier' && utils.isKISSY(object.name)) {
                    //S.UA
                    return upgrade(node, moduleInfo, parent);
                }
            }

            return node;
        },
        leave: function (node, parent) {
            if (node.type == 'Identifier'){
                variables.push(node.name);
            }
        }
    });

    upgrade.fixEvent(ast, moduleInfo)
           .fixRequire(ast, moduleInfo)
           .fixExports(ast, moduleInfo)
           .clean(ast, moduleInfo);

    ast = escodegen.attachComments(ast, ast.comments, ast.tokens);

    if(options.commonJs) {
        if(!moduleInfo.factory.body.body) {
            ast.body = [moduleInfo.factory.body];
        }else {
            ast.body = moduleInfo.factory.body.body;
        }
    }
    var code = utils.decodeVariableName(utils.generateCode(ast), variables);

    return {
        code: code,
        deprecated_api: utils.unique(moduleInfo.deprecated_api),
        unknown_api: utils.unique(moduleInfo.unknown_api)
    }
}

module.exports = parse;