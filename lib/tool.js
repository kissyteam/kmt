var UglifyJS = require("uglify-js"),
    color = require('colors'),
    fs = require('fs'),
    path = require('path'),
    iconv = require('iconv-lite'),
    mkdirp = require('mkdirp'),
    util = require("util");

var START_S = 0,
    SINGLE_S = 1;
    MULTI_S = 2,
    NL = '\n',
    EMPTY = '',
    ESCAPE = '\\',
    START_COMMENT = END_COMMENT = '/',
    OPEN_COMMENT = CLOSE_COMMENT = '*',
    DQUOTE = '"',
    SQUOTE = "'",

    TAG = "kmt";


function stripComment(input, callback) {
  var current;
  var next;
  var prev;
  var start = -1;
  var state = START_S;
  var output = EMPTY;

  var sstring = dstring = false;

  for (var i = 0; i < input.length; i++) {
    prev = input.charAt(i-1);
    current = input.charAt(i);
    next = input.charAt(i + 1);

    if (START_S === state) {
      switch(current) {
          case DQUOTE:
            if(!sstring) {
              if(ESCAPE !== input.charAt(i - 1)) {
                dstring = !dstring;
              }
            }
            break;
          case SQUOTE:
            if (!dstring) {
              if(ESCAPE !== input.charAt(i - 1)) {
                sstring = !sstring;
              }
            }
            break;
        }
    }

    if (!sstring && !dstring) {

      switch(state) {
        case START_S:

          if(START_COMMENT === current) {
            if( prev == ESCAPE) {
              break;
            }
            if(next == START_COMMENT || next == OPEN_COMMENT) {
                if( start == -1) {
                  start = i;
                }

                state = next == START_COMMENT ? SINGLE_S: MULTI_S;
                i++;
            }
          }
          break;
        case SINGLE_S:
          if(NL === current) {
            state = START_S;
            callback && callback(input.substring(start,i));
            start = -1;
          }
          break;
        case MULTI_S:
          if(CLOSE_COMMENT === current) {
            if(END_COMMENT === next) {
              state = START_S;
              current = EMPTY;
              i++;
              callback && callback(input.substring(start,i+1));
              start = -1;
            }
          }
          break;
      }

      if (START_S !== state) {
        current = EMPTY;
      }
    }

    output = output + current;
  }

  return output;
}

function parseCode(code, callback) {
    UglifyJS.parse(code).walk(new UglifyJS.TreeWalker(function(node, descend) {
                                 callback && callback.apply(this,arguments);
                              }));
}



function log(msg) {
    console.log("[%s] %s", TAG.cyan, msg);
}

function error(msg) {
    msg = util.format.apply(null,arguments);
    log("[ERROR]".green+msg.red);
}

function warn(msg) {
    msg = util.format.apply(null,arguments);
    log("[WARN]".green + msg.redBright);
}

function info(msg) {
    msg = util.format.apply(null,arguments);
    log(msg.green);
}

function stripQuote(s) {
    return s && s.replace(/'|"/g,"").trim();
}


function makeArray(item) {
    return util.isArray(item) ? item : [item];
}


function minify(code) {
    return UglifyJS.minify('(function(){' + code + '})();',{fromString: true}).code
                .replace(/!function\(\)\{/,"")
                .replace(/\}\(\)\;$/,";");
}

function iconvCode(code,charset) {
    code = new Buffer(code);
    code = iconv.decode(code, charset||"utf-8");
    if(/^\uFEFF/.test(code)){
        code = code.toString().replace(/^\uFEFF/, '');
    }
    return code.toString();
}

function wrapKISSY(code, options) {
        options = options || {};
        if(options.fromFile) {
            code = fs.readFileSync(code).toString();
        }

        code = iconvCode(code, options.charset);
        var sourceCode = code,
            minifyCode = "",
            wrappedCode = code,
            requires = options.requires? JSON.stringify(options.requires)+",": "";

        minifyCode = '\rKISSY.add(' + (options.moduleName ? util.format("'%s',",options.moduleName) : '') +  requires + 'function(S ,require, exports, module) {' + minify(code) + '});';

        wrappedCode = '\rKISSY.add(' + (options.moduleName ? util.format("'%s',",options.moduleName) : '') + requires + 'function(S ,require, exports, module) {\n' + code + '\n});';

        return {
            sourceCode:  code,
            minifyCode:  minifyCode.trim(),
            wrappedCode: wrappedCode.trim()
        }
    }

function isCallKISSYAdd (node) {
    return node && /KISSY|S/.test(node.start.value)
                &&  node.expression
                &&  node.expression.property == "add";
}

module.exports = {
    stripComment:stripComment,
    parseCode: parseCode,
    stripQuote: stripQuote,
    makeArray:makeArray,
    wrapKISSY:wrapKISSY,
    isCallKISSYAdd: isCallKISSYAdd,
    minify:minify,
    write: function(filePath, data, options) {
        if(options === true) {
            options = {
                sure: true
            }
        }
        options = options || {};

        var dirPath = path.dirname(filePath);

        if(!options.sure && !fs.existsSync(dirPath)) {
            mkdirp.sync(dirPath);
        }
        if(!options.async) {
            fs.writeFileSync(filePath,data);
        }else{
            fs.writeFile(filePath,data);
        }
    },
    log: {
        error: error,
        warn: warn,
        info: info
    },
    mkdirp:mkdirp
}