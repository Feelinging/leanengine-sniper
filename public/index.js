'use strict';
/* globals $, Highcharts, _, utils, EventSource */

var responseTypes = utils.responseTypes;
var requestsCountByType = utils.requestCount;

var pieChartItemLimit = 15;
var columnChartItemLimit = 10;
var lineChartItemLimit = 8;
var areaChartItemLimit = 5;
var realtimeRangeLimit = 600 * 1000;

var realtimeStream;

var initialData = {
  allRouters: {},
  allInstances: {},
  allStatusCodes: {},
  routers: [ /* {
    instance: 'localhost',
    createdAt: new Date(),
    urls: [{
      url: 'GET /',
      totalResponseTime: 650,
      '200': 3
    }]
  } */ ],
  cloudApi: [
    // ...
  ]
};

var displayOptions = {
  byRouter: null,
  byStatusCode: null,
  byInstance: null,

  logsFrom: utils.parseTimeString('-1d'),
  logsTo: utils.parseTimeString('now'),

  currentLogsFromToField: '#logsFrom'
};

useCloudData();

function useCloudData() {
  if (realtimeStream) {
    realtimeStream.close();
    realtimeStream = null;
  }

  $.get('logs.json', {
    logsFrom: displayOptions.logsFrom.toJSON(),
    logsTo: displayOptions.logsTo.toJSON()
  }, function(data) {
    resetInitalData();

    var flattenedLogs = flattenLogs(data.reverse(), initialData);

    initialData.routers = flattenedLogs.routers;
    initialData.cloudApi = flattenedLogs.cloudApi;

    updateOptions();
    displayCharts();
  });
}

function useRealtimeData() {
  resetInitalData();
  displayCharts();

  realtimeStream = new EventSource('realtime.json');

  realtimeStream.addEventListener('message', function(event) {
    var log = JSON.parse(event.data);

    var flattenedLogs = flattenLogs([log], initialData);

    var filterLogs = function(log) {
      return log.createdAt.getTime() + realtimeRangeLimit > Date.now();
    };

    initialData.routers = initialData.routers.filter(filterLogs).concat(flattenedLogs.routers);
    initialData.cloudApi = initialData.cloudApi.filter(filterLogs).concat(flattenedLogs.cloudApi);

    updateOptions();
    displayCharts();
  });

  realtimeStream.addEventListener('error', function(err) {
    console.error(err);
  });
}

function resetInitalData() {
  initialData = {
    allRouters: {},
    allInstances: {},
    allStatusCodes: {},
    routers: [],
    cloudApi: []
  };

  resetOptions();
}

function filterLogs(logs, filterOptions) {
  var byRouter = filterOptions.byRouter == '*' ? null : filterOptions.byRouter;
  var byInstance = filterOptions.byInstance == '*' ? null : filterOptions.byInstance;
  var byStatusCode = filterOptions.byStatusCode == '*' ? null : filterOptions.byStatusCode;

  return _.compact(logs.map(function(log) {
    if (byInstance && log.instance != byInstance)
      return null;

    if (byRouter) {
      var url = _.findWhere(log.urls, {url: byRouter});

      log = _.extend({}, log, {
        urls: url ? [url] : []
      });
    }

    if (byStatusCode) {
      log = _.extend({}, log, {
        urls: log.urls.map(function(url) {
          return _.pick(url, function(value, key) {
            if (isFinite(parseInt(key)) && key != byStatusCode)
              return false;
            else
              return true;
          });
        })
      });
    }

    return _.cloneDeep(log);
  }));
}

function mergeInstances(logs) {
  var result = [];

  logs.forEach(function(log) {
    var lastLog = _.last(result);

    // 合并的条件：存在上一条记录，且上一条记录与当前记录属于不同实例，且上一条记录没有合并过当前实例的记录
    if (lastLog && lastLog.instance != log.instance && !_.includes(lastLog.mergedInstance, log.instance)) {
      utils.mergeUrlstoUrls(lastLog.urls, log.urls);

      if (lastLog.mergedInstance)
        lastLog.mergedInstance.push(log.instance);
      else
        lastLog.mergedInstance = [log.instance];
    } else {
      result.push(_.cloneDeep(log));
    }
  });

  return result;
}

function flattenLogs(logs, counters) {
  var routerData = [];
  var cloudApiData = [];

  logs.forEach(function(log) {
    var createdAt = new Date(log.createdAt);

    log.instances.forEach(function(instanceBucket) {
      var instanceName = instanceBucket.instance;

      instanceBucket.routers.forEach(function (url) {
        var requests = requestsCountByStatus(url);

        incrCounter(counters.allInstances, instanceName, requests);
        incrCounter(counters.allRouters, url.url, requests);

        _.map(url, function(count, statusCode) {
          if (isFinite(parseInt(statusCode))) {
            incrCounter(counters.allStatusCodes, statusCode, count);
          }
        });
      });

      routerData.push({
        instance: instanceName,
        createdAt: createdAt,
        urls: instanceBucket.routers
      });

      cloudApiData.push({
        instance: instanceName,
        createdAt: createdAt,
        urls: instanceBucket.cloudApi
      });
    });
  });

  return {
    routers: routerData,
    cloudApi: cloudApiData
  };
}

function buildCounters(routerLogs, counters) {
  routerLogs.forEach(function(log) {
    log.urls.forEach(function(url) {
      _.each(url, function(count, statusCode) {
        if (isFinite(parseInt(statusCode))) {
          incrCounter(counters.allStatusCodes, statusCode, count);
          incrCounter(counters.allInstances, log.instance, count);
          incrCounter(counters.allRouters, url.url, count);
        }
      });
    });
  });
}

function incrCounter(counter, field, count) {
  if (counter[field])
    counter[field] += count;
  else
    counter[field] = count;
}

function counterToSortedArray(counter) {
  return _.sortByOrder(_.map(counter, function(count, name) {
    return {
      name: name,
      count: count
    };
  }), 'count', 'desc');
}

function requestsCountByStatus(url) {
  return _.sum(_.map(url, function(value, key) {
    if (isFinite(parseInt(key)))
      return value;
    else
      return null;
  }));
}

function buildCacheOnLogs(logs) {
  logs.forEach(function (log) {
    var logRequests = 0;
    var logTotalResponseTime = 0;

    responseTypes.forEach(function(type) {
      log[type] = 0;
    });

    log.urls.forEach(function(url) {
      var urlRequests = 0;

      responseTypes.forEach(function(type) {
        url[type] = url[type] || 0;
      });

      _.map(url, function(count, key) {
        if (isFinite(parseInt(key))) {
          var responseType = utils.typeOfStatusCode(parseInt(key));
          url[responseType] += count;
          log[responseType] += count;
          urlRequests += count;
        } else if (_.includes(responseTypes, key)) {
          log[key] += count;
          urlRequests += count;
        }
      });

      if (urlRequests)
        url.responseTime = url.totalResponseTime / urlRequests;

      logTotalResponseTime += url.totalResponseTime;
      logRequests += urlRequests;
    });

    if (logRequests)
      log.responseTime = logTotalResponseTime / logRequests;
  });
}
