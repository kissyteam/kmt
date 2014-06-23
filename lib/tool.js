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


var space = new RegExp('[' + [
    ' ',
    '\u3000',
    '\u2800',
    '\u205f',
    '\u202f',
    '\u2000-\u200a',
    '\u18aa-\u18af',
    '\u1878-\u187f',
    '\u181a-\u181f',
    '\u180f',
    '\u0fd9-\u0fff',
    '\u0fcd',
    '\u0fbd',
    '\u0f98',
    '\u0f8c-\u0f8f',
    '\u0f6d-\u0f70',
    '\u0f48',
    '\u065f',
    '\u0620',
    '\u00f7',
    '\u00a0',
    '\u0020'
  ].join('') + ']', 'g'),

    invisible = new RegExp('[' + [
    '\u206a-\u206f',
    '\u2060-\u2064',
    '\u2028-\u202e',
    '\u200b-\u200f',
    '\u180b-\u180e',
    '\u00ad',
    '\u0080-\u009f',
    '\u000e-\u001f',
    '\u0000-\u0008',
    '\r'
  ].join('') + ']', 'g')
var tab = /\t/g
var line = /[\n\v\f]/g

function cleanWhitespace (str, opt) {
  opt = opt || {}

  var _tab = opt.tabSpace ? new RegExp('\t|[ ]{'+opt.tabSpace+'}','g') : tab

  return str.replace(_tab, opt.tab || '\t')
            .replace(space, opt.space || ' ')
            .replace(invisible, opt.invisible || '')
            .replace(line, opt.line || '\n')

}



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
    iconvCode:iconvCode,
    cleanWhitespace:cleanWhitespace,
    mkdirp:mkdirp
}