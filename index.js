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

var instanceName = os.hostname().replace(/[^a-zA-Z0-9_]/g, '');

var sampleBucket = { // bucket, log
  instanceA: { // instance, instanceBucket
    routers: [ // urls
      {url: 'urlA', totalResponseTime: 650, '200': 3}, // url, urlLog
      // ...
    ],
    cloudApi: [
      // ...
    ]
  },
  instanceB: {
    // ...
  }
};

/**
 * @param {AV} options.AV
 * @param {String} options.redis
 * @param {Number=300000} options.commitCycle
 * @param {Boolean=true} options.ignoreStatics
 * @param {Object[]=} options.rules
 *          {match: /^GET \/(js|css).+/, ignore: true}
 *          {match: /^GET \/(js|css).+/, rewrite: 'GET /*.$1'}
 */
module.exports = exports = function(options) {
  var AV = options.AV;
  var redis;
  var rewriteRules = options.rules || [];
  options.commitCycle = options.commitCycle || 300000;

  if (options.ignoreStatics !== false) {
    rewriteRules.unshift({
      match: /^GET .*\.(css|js|jpe?g|gif|png|woff2?|ico)$/,
      rewrite: 'GET *.$1'
    });
  }

  var collector = createCollector();

  if (options.redis) {
    redis = new Redis(options.redis);
    startRealtime(redis, collector);
  }

  injectCloudRequest(AV, collector);
  startUploading(AV.Object.extend('LeanEngineSniper'), redis, collector, options);

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

  return sniper;
};

function injectCloudRequest(AV, collector) {
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

    var responseType = function(err) {
      if (!err)
        return 'success';
      else if (err.code > 0)
        return 'clientError';
      else
        return 'serverError';
    };

    var responseTime = function() {
      return Date.now() - startedAt.getTime();
    };

    promise.then(function(result, statusCode) {
      if (cloudUrl.match(/classes\/LeanEngineSniper/))
        return;

      debug('cloudApi: %s %s', cloudUrl, statusCode);
      collector.logCloudApi(cloudUrl, responseType(), responseTime());
    }, function(err) {
      debug('cloudAapi: %s Error %s', cloudUrl, err.code);
      collector.logCloudApi(cloudUrl, responseType(err), responseTime());
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

  var createBucket = function(instanceBucket) {
    return _.object([[instanceName, instanceBucket]]);
  };

  var commitToRedis = function(range) {
    debug('commitToRedis');

    var instance = collector.flush();

    if (utils.isEmptyInstance(instance))
      return;

    redis.rpush(redisBucketsKey(range), JSON.stringify(createBucket(instance)), function(err) {
      if (err) console.error(err);
    });
  };

  var uploadToCloud = function(log) {
    (new Storage()).save(log, {
      success: function() {
        debug('Upload success %j', _.keys(log));
      },
      error: function(log ,err) {
        console.error(err);
      }
    });
  };

  var uploadWithoutRedis = function() {
    var instance = collector.flush();

    if (!utils.isEmptyInstance(instance))
      uploadToCloud(createBucket(instance));

    setTimeout(uploadWithoutRedis, nextRange() - Date.now());
  };

  var uploadWithRedis = function(lastRange) {
    commitToRedis(lastRange);
    setTimeout(function() {
      redis.lrange(redisBucketsKey(lastRange), 0, -1, function(err, buckets) {
        redis.del(redisBucketsKey(lastRange), function(err, deletedKeys) {
          debug('deletedKeys', deletedKeys);
          if (deletedKeys > 0) {
            var bucket = utils.mergeBuckets(buckets.map(JSON.parse));

            if (!_.isEmpty(bucket))
              uploadToCloud(bucket);
          }
        });
      });
    }, 10000);
    setTimeout(uploadWithRedis.bind(null, currentRange()), nextRange() - Date.now());
  };

  if (redis) {
    setTimeout(uploadWithRedis.bind(null, currentRange()), nextRange() - Date.now());
  } else {
    setTimeout(uploadWithoutRedis, nextRange() - Date.now());
  }
}

function startRealtime(redis, collector) {
  setInterval(function() {
    redis.publish('__lcSniper:realtime', JSON.stringify(collector.flushRealtime()), function(err) {
      if (err) console.error(err);
    });
  }, 5000);
}

function redisBucketsKey(time) {
  return '__lcSniper:buckets:' + time;
}
