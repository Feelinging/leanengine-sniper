var utils = require('./public/utils');

module.exports = function(instanceName) {
  var newInstance = function() {
    return {
      instance: instanceName,
      routers: [],
      cloudApi: [],
    };
  };

  var instanceBucket = newInstance();
  var realtimeBucket = newInstance();

  return {
    flush: function() {
      var result = instanceBucket;
      instanceBucket = newInstance();
      return result;
    },

    flushRealtime: function() {
      var result = realtimeBucket;
      realtimeBucket = newInstance();
      return result;
    },

    logRouter: function(requestUrl, statusCode, responseTime) {
      var url = {
        url: requestUrl,
        totalResponseTime: responseTime
      };

      url[statusCode] = 1;

      utils.mergeUrlToUrls(instanceBucket.routers, url);
      utils.mergeUrlToUrls(realtimeBucket.routers, url);
    },

    logCloudApi: function(requestUrl, statusCode, responseTime) {
      var url = {
        url: requestUrl,
        totalResponseTime: responseTime
      };

      url[statusCode] = 1;

      utils.mergeUrlToUrls(instanceBucket.cloudApi, url);
      utils.mergeUrlToUrls(realtimeBucket.cloudApi, url);
    }
  };
};
