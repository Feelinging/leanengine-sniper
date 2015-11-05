(function(utils, _) {
  utils.responseTypes = ['success', 'clientError', 'serverError'];

  utils.mergeBuckets = function(buckets) {
    var result = {
      instances: []
    };

    buckets.forEach(function(bucket) {
      bucket.instances.forEach(function(instanceBucket) {
        if (!utils.isEmptyInstance(instanceBucket)) {
          var targetInstance = _.findWhere(result.instances, {instance: instanceBucket.instance});

          if (targetInstance)
            utils.mergeInstance(targetInstance, instanceBucket);
          else
            result.instances.push(instanceBucket);
        }
      });
    });

    return result;
  };

  utils.mergeInstance = function(target, source) {
    ['routers', 'cloudApi'].forEach(function (field) {
      source[field].forEach(function(url) {
        utils.mergeUrlToUrls(target[field], url);
      });
    });
  };

  utils.mergeUrlToUrls = function(urls, url) {
    var targetUrl = _.findWhere(urls, {url: url.url});

    if (targetUrl) {
      utils.mergeUrl(targetUrl, url);
    } else {
      urls.push(url);
    }
  };

  utils.mergeUrl = function(targetUrl, sourceUrl) {
    targetUrl.totalResponseTime += sourceUrl.totalResponseTime || 0;

    _.each(sourceUrl, function(value, key) {
      if (isFinite(parseInt(key)) || _.contains(utils.responseTypes, key)) {
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

}).apply(this, (function() {
  if (typeof exports === 'undefined')
    return [window.utils = {}, _];
  else
    return [exports, require('underscore')];
})());
