## LeanEngine Sniper

这个中间件会统计 express 程序被访问的各路由的响应代码、响应时间，以及程序所调用的 LeanCloud API 的名称、响应结果（成功或失败）、响应时间，帮助你监控和诊断 LeanEngine 应用遇到的性能问题。

**安装依赖**：

    npm install --save leanengine-sniper

**在你的 express 程序中添加中间件**：

    var sniper = require('leanengine-sniper');
    var AV = require('leanengine');
    var app = express();
    app.use(sniper({AV: AV}));

等它收集一段时间数据，就可以打开你的站点下的 `/__lcSniper` 查看统计图表了，basicAuth 的账号是 appId，密码是 masterKey.

数据会储存在你的应用云储存中的 `LeanEngineSniper` 这个 Class 中，默认会每五分钟创建一条记录，因此你的应用每个月会因上传统计数据而消耗 9k 次云存储 API 调用。

**配置 Redis**：

配置 Redis 后，Sniper 可以提供过去十分钟以 5 秒钟为精度的实时视图；此外如果你的应用运行着多个实例，借助 Redis 可以通过合并多个实例的数据减少调用云存储的次数：

    app.use(sniper({AV: AV, redis: process.env['REDIS_URL_cache1']}));

**定义自己的 URL 分组或忽略规则**：

你可以给 sniper 传一个 rules 参数，定义一些处理 URL 的规则：

    app.use(sniper({
      AV: AV,
      rules: [
        {match: /^GET \/(pdf|docx?).+/, rewrite: 'GET /$1'}, // 将例如 /pdf/overview.pdf 的 URL 重写为 /pdf
        {match: /^GET \/public/, ignore: true}            // 忽略 GET /public 开头的 URL
      ]
    }));

**sniper 的更多选项**：

* specialStatusCodes, 数字数组，为了记录合适大小的数据，默认只会单独记录几个常见的 statusCode, 你可以覆盖默认的值。
* ignoreStatics, 布尔值，默认启用，会将常见的静态文件 URL 重写为类似 `GET *.js` 的 URL.
* commitCycle, 毫秒数，默认五分钟，上传统计数据的间隔，建议设置在 1 分钟到 20 分钟内。
