(function(utils, _) {
  utils.responseTypes = ['success', 'clientError', 'serverError'];

  utils.mergeBuckets = function(buckets, includesEmptyInstance) {
    var result = {
      instances: []
    };

    buckets.forEach(function(bucket) {
      bucket.instances.forEach(function(instanceBucket) {
        var targetInstance = _.findWhere(result.instances, {instance: instanceBucket.instance});

        if (targetInstance)
          utils.mergeInstance(targetInstance, instanceBucket);
        // 除非设置了 includesEmptyInstance, 才将空的 instanceBucket 包含在结果中
        else if (!targetInstance && (!utils.isEmptyInstance(instanceBucket) || includesEmptyInstance))
          result.instances.push(instanceBucket);
      });
    });

    return result;
  };

  utils.mergeInstance = function(target, source) {
    ['routers', 'cloudApi'].forEach(function (field) {
      utils.mergeUrlstoUrls(target[field], source[field]);
    });
  };

  utils.mergeUrlstoUrls = function(target, source) {
    source.forEach(function(url) {
      utils.mergeUrlToUrls(target, url);
    });
  };

  utils.mergeUrlToUrls = function(urls, url) {
    var targetUrl = _.findWhere(urls, {url: url.url});

    if (targetUrl) {
      utils.mergeUrl(targetUrl, url);
    } else {
      urls.push(_.clone(url));
    }
  };

  utils.mergeUrl = function(targetUrl, sourceUrl) {
    targetUrl.totalResponseTime += sourceUrl.totalResponseTime || 0;

    _.each(sourceUrl, function(value, key) {
      if (isFinite(parseInt(key)) || _.includes(utils.responseTypes, key)) {
        if (targetUrl[key])
          targetUrl[key] += value;
        else
          targetUrl[key] = value;
      }
    });
  };

  utils.isEmptyInstance = function(instanceBucket) {
    return _.isEmpty(instanceBucket.routers) && _.isEmpty(instanceBucket.cloudApi);
  };

  utils.typeOfStatusCode = function(code) {
    if (code >= 200 && code < 400)
      return 'success';
    else if (code >= 400 && code < 500)
      return 'clientError';
    else if (code >= 500)
      return 'serverError';
  };

  utils.requestCount = function(urlStat) {
    var result = 0;
    utils.responseTypes.forEach(function(field) {
      if (urlStat[field])
        result += urlStat[field];
    });
    return result;
  };

  utils.parseTimeString = function(timeString) {
    if (!timeString || timeString == 'now') {
      return new Date();
    }

    if (!_.isString(timeString)) {
      return new Date(timeString);
    }

    var matched = timeString.match(/^(\+|-)((\d+)d)?((\d+)h)?((\d+)m)?/);

    if (matched) {
      var base = matched[1] == '+' ? 1 : -1;
      var d = matched[3] ? parseInt(matched[3]) : 0;
      var h = matched[5] ? parseInt(matched[5]) : 0;
      var m = matched[7] ? parseInt(matched[7]) : 0;

      h += d * 24;
      m += h * 60;

      var timestamp = Date.now() + base * m * 60000;

      return new Date(timestamp);
    } else if (timeString.match(/^\d{4,}$/)) {
      return new Date(parseInt(timeString));
    } else {
      return new Date(timeString);
    }
  };

}).apply(this, (function() {
  if (typeof exports === 'undefined')
    return [window.utils = {}, _];
  else
    return [exports, require('underscore')];
})());
