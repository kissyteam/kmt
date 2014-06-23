var test = require("./kmt"),
    fs = require("fs"),
    path = require("path");

var code = fs.readFileSync("/Users/taojie/work/buy/mt/index.js").toString();

test.test(code,{
    fromString:true,
    kissy5:true
});