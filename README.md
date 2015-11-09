## LeanEngine Sniper

这个中间件会记录 express 程序被访问的路由、StatusCode、响应时间，以及程序所调用的 LeanCloud API 的类别和响应时间；Sniper 提供了一个 Web UI 来来展示这些统计数据，支持以路由、实例、StatusCode 三个维度来进行分组展现，帮助你监控和诊断 LeanEngine 应用遇到的性能问题。

**添加依赖**：

    npm install --save leanengine-sniper

**在你的 express 程序中添加中间件**：

    var sniper = require('leanengine-sniper');
    var AV = require('leanengine');
    var app = express();
    app.use(sniper({AV: AV}));

等它收集一段时间数据，就可以打开你的站点下的 `/__lcSniper` 查看统计图表了，basicAuth 的账号是 appId，密码是 masterKey.

数据会储存在你的应用云储存中的 `LeanEngineSniper` 这个 Class 中（如果你在设置中禁用了「客户端创建 Class」，则需要你手动创建），默认会每五分钟创建一条记录，因此你的应用每个月会因上传统计数据而消耗 9k 次云存储 API 调用。

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
* realtimeCycle, 毫秒数，默认五秒钟，实时统计数据的刷新间隔。
* className, 字符串，默认 `LeanEngineSniper`, 用于存储统计数据的 Class.

## Web UI 使用说明

### 筛选

目前 Sniper 提供了三个维度的筛选功能：路由筛选、实例筛选、响应代码筛选。

选项后面的数字代表这一个选项代表的请求量；默认选项为空，代表不筛选。

星号选项则代表在这个维度上对数据进行分组展示，一次只能按照一个维度来分组，分组可以和筛选组合使用；取决于图表类型，只会显示请求量靠前的几个分组，以避免在图表上有太多的线。

路由筛选、响应代码筛选仅对和路由有关的图表有效；实例筛选对所有图表都有效。

### 图表

* 路由请求量

    默认根据响应代码分为 success, clientError, serverError 三组。

* 路由响应时间

    因为没有源数据，响应代码的筛选和分组不会对该图表生效。

* 实例请求量

    默认分为 success, clientError, serverError 三组，可以选择按照响应代码分组；只会显示请求量最大的 10 实例。

* 实例平均响应时间

    只会显示请求量最大的 10 实例。

* 路由响应代码分布

* 路由分布

    只会显示请求量最大的 15 个路由。

* 云调用分布

    只会显示请求量最大的 15 类请求。

* 云调用次数

* 云调用平均响应时间

## 截图

![Web UI](https://cloud.githubusercontent.com/assets/1191561/10993751/43c5f926-84ac-11e5-89c7-bcf350839ab2.png)
