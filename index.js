'use strict';

var onFinished = require('on-finished');
var onHeaders = require('on-headers');
var EventEmitter = require('events');
var pathToRegexp = require('path-to-regexp');
var debug = require('debug')('AV:sniper');
var Redis = require('ioredis');
var os = require('os');
var _ = require('underscore');

var createCollector = require('./collector');
var utils = require('./public/utils');

var storageObjectSample = { // bucket, log
  instances: [{ // instance, instanceBucket
    instance: 'localhost',
    routers: [ // urls
      {url: 'urlA', totalResponseTime: 650, '200': 3}, // url, urlLog
      // ...
    ],
    cloudApi: [
      // ...
    ]
  }, {
    instance: 'instanceB',
    // ...
  }]
};

/**
 * @param {AV} options.AV
 * @param {String} options.redis
 * @param {String=} options.className
 * @param {Number=300000} options.commitCycle
 * @param {Number=5000} options.realtimeCycle
 * @param {Boolean=true} options.ignoreStatics
 * @param {Object[]=} options.rules
 *          {match: /^GET \/(js|css).+/, ignore: true}
 *          {match: /^GET \/(js|css).+/, rewrite: 'GET /*.$1'}
 */
module.exports = exports = function(options) {
  options.className = options.className || 'LeanEngineSniper';
  options.commitCycle = options.commitCycle || 300000;
  options.realtimeCycle = options.realtimeCycle || 5000;

  var AV = options.AV;
  var redis;
  var rewriteRules = options.rules || [];

  if (options.ignoreStatics !== false) {
    rewriteRules.unshift({
      match: /^GET .*\.(css|js|jpe?g|gif|png|woff2?|ico)$/,
      rewrite: 'GET *.$1'
    });

    rewriteRules.push({
      match: /^(.*)[a-f0-9]{24}(.*)$/,
      rewrite: '$1:objectId$2'
    });
  }

  var collector = options.collector || createCollector(process.pid + '@' + os.hostname());

  if (options.redis) {
    redis = new Redis(options.redis);
    startRealtime(redis, collector, options);
  }

  injectCloudRequest(AV, collector, options);
  startUploading(AV.Object.extend(options.className), redis, collector, options);

  var sniper = function(req, res, next) {
    req._lc_startedAt = new Date();

    onHeaders(res, function() {
      res._lc_startedAt = new Date();
    });

    onFinished(res, function(err) {
      if (err)
        return console.error(err);

      if (req.originalUrl.match(/__lcSniper/))
        return;

      var requestUrl = req.originalUrl.replace(/\?.*/, '');
      var responseTime = (res._lc_startedAt ? res._lc_startedAt.getTime() : Date.now()) - req._lc_startedAt.getTime();

      if (req.route) {
        // 如果这个请求属于一个路由，则用路由路径替换掉 URL 中匹配的部分
        var regexp = pathToRegexp(req.route.path).toString().replace(/^\/\^/, '').replace(/\/i$/, '');
        var matched = requestUrl.match(new RegExp(regexp, 'i'));

        if (matched[0]) {
          requestUrl = requestUrl.slice(0, matched.index) + req.route.path;
        }
      }

      requestUrl = req.method.toUpperCase() + ' ' + requestUrl;

      if (rewriteRules.some(function(rule) {
        if (requestUrl.match(rule.match)) {
          if (rule.ignore)
            return true;

          requestUrl = requestUrl.replace(rule.match, rule.rewrite);
        }
      })) {
        return debug('router: ignored %s', requestUrl);
      }

      debug('router: %s %s %sms', requestUrl, res.statusCode, responseTime);
      collector.logRouter(requestUrl, res.statusCode, responseTime);
    });

    next();
  };

  return [sniper, require('./server')(AV, options)];
};

function injectCloudRequest(AV, collector, options) {
  var originalRequest = AV._request;

  var generateUrl = function(route, className, objectId, method) {
    var url = method + ' ' + route;

    if (className)
      url += '/' + className;

    if (objectId)
      url += '/:id';

    return url;
  };

  AV._request = function(route, className, objectId, method) {
    var startedAt = new Date();
    var promise = originalRequest.apply(AV, arguments);

    var cloudUrl = generateUrl(route, className, objectId, method);

    var responseTime = function() {
      return Date.now() - startedAt.getTime();
    };

    promise.then(function(result, statusCode) {
      if (className == options.className)
        return;

      debug('cloudApi: %s %s', cloudUrl, statusCode);
      collector.logCloudApi(cloudUrl, statusCode, responseTime());
    }, function(err) {
      debug('cloudApi: %s Error %s', cloudUrl, err.code);
      collector.logCloudApi(cloudUrl, err.code, responseTime());
    });

    return promise;
  };
}

function startUploading(Storage, redis, collector, options) {
  var currentRange = function() {
    var timestamp = Date.now();
    return timestamp - (timestamp % options.commitCycle);
  };

  var nextRange = function() {
    return currentRange() + options.commitCycle;
  };

  var uploadToCloud = function(log) {
    (new Storage()).save(log, {
      success: function() {
        debug('Upload success %j', _.pluck(log.instances, 'instance'));
      },
      error: function(log ,err) {
        console.error(err);
      }
    });
  };

  var uploadWithoutRedis = function() {
    var instance = collector.flush();

    if (!utils.isEmptyInstance(instance))
      uploadToCloud({instances: [instance]});

    setTimeout(uploadWithoutRedis, nextRange() - Date.now());
  };

  var commitToRedis = function(range) {
    var instance = collector.flush();

    if (utils.isEmptyInstance(instance))
      return;

    var bucketKey = redisBucketsKey(range);
    debug('commitToRedis', bucketKey);

    redis.multi()
      .rpush(bucketKey, JSON.stringify({instances: [instance]}))
      .pexpire(bucketKey, options.commitCycle)
      .exec(function(err) {
         if (err) console.error(err);
      });
  };

  var uploadWithRedis = function(lastRange) {
    commitToRedis(lastRange);
    setTimeout(function() {
      var bucketKey = redisBucketsKey(lastRange);

      redis.multi()
        .lrange(bucketKey, 0, -1)
        .del(bucketKey)
        .exec(function(err, result) {
          if (err)
            return console.error(err);

          if (!result[1]) // Redis 返回的结果里没有 DEL 命令的结果
            return console.error('Cant del key from Redis');

          var buckets = result[0][1];
          var deletedKeys = result[1][1];

          debug('DEL %s %s', bucketKey, deletedKeys ? 'success' : 'fail');

          if (deletedKeys > 0) {
            var bucket = utils.mergeBuckets(buckets.map(JSON.parse));

            if (!_.isEmpty(bucket.instances))
              uploadToCloud(bucket);
          }
        });
    }, 10000);
    setTimeout(uploadWithRedis.bind(null, currentRange()), nextRange() - Date.now());
  };

  var timeout = nextRange() - Date.now();

  if (redis) {
    debug('use redis, next commit after %ss', timeout / 1000);
    setTimeout(uploadWithRedis.bind(null, currentRange()), timeout);
  } else {
    debug('no redis, next upload after %ss', timeout / 1000);
    setTimeout(uploadWithoutRedis, timeout);
  }
}

function startRealtime(redis, collector, options) {
  setInterval(function() {
    redis.publish('__lcSniper:realtime', JSON.stringify(collector.flushRealtime()), function(err) {
      if (err) console.error(err);
    });
  }, options.realtimeCycle);
}

function redisBucketsKey(time) {
  return '__lcSniper:buckets:' + time;
}
