var test = require("./kmt"),
    fs = require("fs"),
    path = require("path");

var code = fs.readFileSync("../test/index.js").toString();

test.test(code,{
    fromString:true,
    kissy5:true
});