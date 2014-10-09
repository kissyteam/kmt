#!/usr/bin/env node
var path = require("path"),
    api = require('../build');

var basePath = process.cwd(),
	sourcePath = basePath,
	buildPath;

var program = require("commander"),
	pkg = require("../package");

program
    .version(pkg.version)
    .option('-b, --build [value]', 'build path')
    .option('-s, --source [value]', 'source path')
    .option('-o, --stdout', 'disbale stdout or not')
    .option('--charset [value]','charset')
    .option('-t, --type [value]','code style type, cmd or kissy or modulex')
    .parse(process.argv);


if(!program.build || typeof program.build !== "string") {
	buildPath = path.join(basePath, "../build");
}else{
	buildPath = path.join(basePath,program.build);
}

if(program.source && typeof program.source == "string") {
	sourcePath = path.join(basePath,program.source);
}

var options = {
    charset:program.charset && program.charset == "gbk" ? "gbk" :"utf-8",
	debug: !program.stdout
}

if(program.type == 'cmd') {
    options.commonJs = true;
}else if(program.type == 'kissy') {
    options.modulex = false;
    options.commonJs = false;
}else if(program.type == 'modulex') {
    options.modulex = true;
    options.commonJs = false;
}
console.log(options);
api.buildDir(sourcePath, buildPath, options);
