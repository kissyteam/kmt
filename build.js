var esprima = require('esprima'),
    estraverse = require('estraverse'),
    escodegen = require('escodegen'),
    defaultOptions = require('./lib/defaultOptions'),
    walk = require('walk'),
    mkdirp = require('mkdirp'),
    path = require('path'),
    fs = require('fs'),
    _ = require('underscore'),
    jsdiff = require('diff'),
    xtemplate = require('./lib/xtemplate'),
    parse = require('./lib/index'),
    utils = require('./lib/utils')

var pathSeparatorRe = /[\/\\]/g;

var _defaultOptions = {
    ignoreFiles: ['-min.js'],
    filters: [/[\/]+\.\w+/],
    exclude: ['node_modules'],
    debug: false,
    copy: true //是否copy非js文件
}

//build单个文件
var report = [],
    overview = {
        total:0,
        not_module:0,
        success:0,
        syntx:0,
        error:0,
        other:0
    },
    error_file = {};

var diff_template = new xtemplate(fs.readFileSync(path.join(__dirname,'template/diff.html')).toString());

exports.buildFile = function(src, dest, options) {
    options = _.extend({}, _defaultOptions, options);
    if(!dest) {
        throw new Error("dest file is required!");
    }
    if(options.debug) {
        console.log("building ",src);
    }
    var ext = path.extname(src),
        filename = path.basename(src);
    overview.total++;
    if(ext != '.js') {
        if(options.copy) {
            mkdirp.sync(path.dirname(dest));
            fs.createReadStream(src).pipe(fs.createWriteStream(dest));
            overview.other++;
        }
        return;
    }

    var code = fs.readFileSync(src).toString(),
        original_code = code,
        type = utils.isValidModule(code);

    options.filename = src;
    options.type = type;

    if(type) {
        if(type instanceof Error) {
            report.push({
                file: src,
                message: type.toString()
            });
            error_file[src] = true;
            overview.syntx++;
            code = utils.substitute('{code}\n\n/*{err}*/\n\n', {code:code, err: type.toString()});
        }else{
            var result = parse(code, options);
            code = result.code;
            if(result.deprecated_api.length||result.unknown_api.length) {
                var info = {
                    file: src,
                    dest: dest,
                    message :{
                        api: {
                            deprecated: result.deprecated_api,
                            unknown: result.unknown_api
                        }
                    }
                };
                report.push(info);
                overview.error++;
            }else{
                overview.success++;
            }
        }

        if(!code) {
            return;
        }

        if(path.extname(dest) != '.js') {
            dest = path.join(dest, filename);
        }

        mkdirp.sync(path.dirname(dest));
        fs.writeFile(dest, code);

        process.nextTick(function(){
            if(error_file[src]){
                return;
            }

            var ast = esprima.parse(original_code, defaultOptions.esprima);

            ast = escodegen.attachComments(ast, ast.comments, ast.tokens);

            var diff = jsdiff.diffLines(escodegen.generate(ast,defaultOptions.escodegen),code),
                data = [];

            for (var i=0; i < diff.length; i++) {
                if (diff[i].added && diff[i + 1] && diff[i + 1].removed) {
                    var swap = diff[i];
                    diff[i] = diff[i + 1];
                    diff[i + 1] = swap;
                }

                if (diff[i].removed) {
                    data.push("<del>"+diff[i].value+"</del>");
                } else if (diff[i].added) {
                    data.push("<ins>"+diff[i].value+"</ins>");
                } else {
                    data.push(diff[i].value);
                }
            }

            var diffFile = dest.replace(/\.js$/,".diff.html");
            if(options.dir) {
                diffFile = diffFile.replace(options.dir, path.join(options.dir, 'kmt_diff'));
                mkdirp.sync(path.dirname(diffFile));
            }

            fs.writeFile(diffFile, diff_template.render({
                                                            content:data.join(""),
                                                            dest: dest,
                                                            src:src
                                                        }));
        });
        return true;
    }else{
        overview.not_module++;
    }
}

//build整个目录
exports.buildDir = function(sourceDir, destDir, options) {
    options = _.extend({}, _defaultOptions, options);

    if(!destDir) {
        throw new Error("destDir  is required!");
    }
    walk.walk(sourceDir, {
                            followLinks: false,
                            filters: options.filters
                         }
        )
        .on("file", function (root, fileStats, next) {
            var file = path.join(root,fileStats.name);
            var relative = file.replace(sourceDir,"").trim();

            var ignore = options.ignoreFiles && options.ignoreFiles.some(function (filter) {
              if (fileStats.name.match(filter)) {
                return true;
              }
            });

            if(options.exclude && !ignore) {
                 ignore = options.exclude.some(function(item) {
                     return path.dirname(file).split(pathSeparatorRe).some(function(pathName) {
                         return pathName == item;
                     });
                 });
            }
            if(ignore) {
                return next();
            }
            if(relative ) {
                options.dir = destDir;
                exports.buildFile(file,path.join(destDir, relative), options);
            }
            next();
        }).on("end", function() {
            console.info("build done!");
            var report_tpl = fs.readFileSync(path.join(__dirname,'template/report.html')).toString();
            report = new xtemplate(report_tpl).render({
                                                            report_list: report,
                                                            overview:overview,
                                                            diff_dir:path.join(destDir, 'kmt_diff')
                                                       });
            fs.writeFile(path.join(destDir,'kmt_report.html'),report);
        });
}
