var esprima = require('esprima'),
    estraverse = require('estraverse'),
    escodegen = require('escodegen'),
    defaultOptions = require('./defaultOptions');

function splitSlash(str) {
    var parts = str.split(/\//);
    if (str.charAt(0) === '/' && parts[0]) {
        parts.unshift('');
    }
    if (str.charAt(str.length - 1) === '/' && str.length > 1 && parts[parts.length - 1]) {
        parts.push('');
    }
    return parts;
}

var prefix = '$$$_',
    prefixReg =/\$\$\$_([\w_$]+)/g;

module.exports = {
    //检测是否是合法的KISSY模块
    isValidModule: function(code) {
        if(!code.trim()) {
            return false;
        }

        var self = this,
            ast;

        try{
            ast = esprima.parse(code, defaultOptions.esprima);
        }catch(err) {
            return err;
        }
        if(!ast.body.length) {
            return false;
        }

        if(ast.body.length>1) {
            var has_exports = ast.body.some(function(body){
                                   return self.isModuleExports(body);
                              });
            if(has_exports) {
                return 1;//commonJs模块
            }
        }else {
            var body = ast.body[0];
            if(body.type == 'ExpressionStatement' && self.isModuleAdd(body.expression)) {
                return 2; //原始的KISSY模块
            }
        }

        return false;
    },

    isKISSY: function(s) {
        return s&&['KISSY','S'].indexOf(s)>-1;
    },

    isModuleAdd: function(node, parent) {
        if(node.type != 'CallExpression') {
            return false;
        }
        var callee = node.callee;
        return this.isKISSY(callee.object && callee.object.name) && callee.property.name == 'add';
    },

    isModuleExports: function(node) {
        if(node.type == 'ExpressionStatement' && node.expression.type == 'AssignmentExpression') {
            var left = node.expression.left;

            if(left.type == 'MemberExpression') {
                if(left.object.name == 'module' && left.property.name == 'exports') {
                    return true;
                }
            }
        }
        return false;
    },

    generateCode: function(ast) {
        return escodegen.generate(ast,defaultOptions.escodegen);
    },
    encodeVariableName: function(name) {
        name = name.split("");
        name[0] = name[0].toUpperCase();
        name = name.join("");
        return prefix + name;
    },

    decodeVariableName: function(code, variables) {
        return  code.replace(prefixReg, function(a,b){
                    while(variables.indexOf(b) > -1) {
                        b = '_' + b;
                    }
                    return b;
                });
    },

    substitute: function (str, o, regexp) {
        var SUBSTITUTE_REG = /\\?\{([^{}]+)\}/g;
        if (typeof str !== 'string' || !o) {
            return str;
        }
        return str.replace(regexp || SUBSTITUTE_REG, function (match, name) {
            if (match.charAt(0) === '\\') {
                return match.slice(1);
            }
            return o[name] === undefined ? "" : o[name];
        });
    },

    normalizePath: function (parentPath, subPath) {
        var firstChar = subPath.charAt(0);
        if (firstChar !== '.') {
            return subPath;
        }
        var parts = splitSlash(parentPath);
        var subParts = splitSlash(subPath);
        parts.pop();
        for (var i = 0, l = subParts.length; i < l; i++) {
            var subPart = subParts[i];
            if (subPart === '.') {
            } else if (subPart === '..') {
                parts.pop();
            } else {
                parts.push(subPart);
            }
        }
        return parts.join('/').replace(/\/+/, '/');
    },

    remove: function(node) {
        if(!node.parent) {
            return;
        }

        var _node = node, i = 0;
        //最多向上循环找10次,避免进入死循环
        while(_node && _node.parent.type != 'BlockStatement' && i<10) {
            _node = node.parent;
            i++;
        }
        _node.remove = true;
        if(_node.parent && _node.parent.body) {
            _node.parent.body = _node.parent.body.filter(function(item){
                return !item.remove;
            });
        }
    },

    lastIndexOf: function (item, arr) {
        for (var i = arr.length - 1; i >= 0; i--) {
            if (arr[i] === item) {
                break;
            }
        }
        return i;
    },
    unique: function (a, override) {
        var b = a.slice();
        if (override) {
            b.reverse();
        }
        var i = 0,
            n,
            item;

        while (i < b.length) {
            item = b[i];
            while ((n = this.lastIndexOf(item, b)) !== i) {
                b.splice(n, 1);
            }
            i += 1;
        }

        if (override) {
            b.reverse();
        }
        return b;
    }
};
