#!/usr/bin/env node
var path = require("path"),
	parser = require('../lib/kmt');

var basePath = process.cwd(),
	sourcePath = basePath,
	buildPath;

var program = require("commander"),
	pkg = require("../package");

program
    .version(pkg.version)
    .option('-b, --build [value]', 'build path')
    .option('-s, --source [value]', 'source path')
    .option('-m, --minify', 'minify or not')
    .option('-o, --stdout', 'disbale stdout or not')
    .option('-k, --kv [value]','kissy version')
    .option('-t, --type [value]','code style type, cmd or kissy')
    .parse(process.argv);

var options = {};

if(!program.build || typeof program.build !== "string") {
	buildPath = path.join(basePath, "../build");
}else{
	buildPath = path.join(basePath,program.build);
}

if(program.source && typeof program.source == "string") {
	sourcePath = path.join(basePath,program.source);
}
//return console.log(program);
parser.build({
	src: sourcePath,
	dest: buildPath,
	stdout: !program.stdout,
	minify: program.minify,
	style:program.type,
	v:program.kv
});
