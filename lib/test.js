var test = require("./kmt"),
    fs = require("fs"),
    tool = require("./tool"),
    iconv = require('iconv-lite'),
    path = require("path");

//iconv.extendNodeEncodings();

var code = fs.readFileSync("../test/index.js").toString();

//var buf = new Buffer(code);
//console.log(Buffer.isEncoding("utf-8"));

//str = iconv.decode(new Buffer(code), 'gbk');

// Convert from js string to an encoded buffer.
//str = iconv.decode(code, 'gbk');

// Check if encoding is supported
//iconv.encodingExists("us-ascii")
//console.log(str.toString())
//console.log(tool.iconvCode(code,'gbk'))
test.test(code,{
    fromString:true
});

