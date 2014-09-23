KMT
===
> KISSY Module Transform

KMT是一个将KISSY 1.4版无缝升级到KISSY 5.0的工具，无需人工改写代码就能够平滑的完成KISSY升级。

### 使用帮助

#### build
```
kmt -s ./kissy1.4_code -b ./kissy5.0_code --charset gbk
```
* -s kissy1.4代码目录   
* -b 转换后的kissy5.0代码目录   
* --charset 文件编码 默认utf-8   

#### diff文件
build下会自动生成一个diff的文件夹，存放build前与build之后的文件差异

### 集成插件

* [gulp-kmc](https://github.com/hustxiaoc/gulp-kmc)
