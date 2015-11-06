'use strict';
/* globals $, Highcharts, _, utils */

var responseTypes = utils.responseTypes;
var requestsCountByType = utils.requestCount;

var pieChartItemLimit = 15;
var lineChartItemLimit = 8;

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
  // 路由筛选，由 filterByRouter 实现
  byRouter: null,
  // 路由状态码筛选，在 displayCharts 中实现
  byStatusCode: null,
  // 应用实例筛选，由 filterByInstance 实现
  byInstance: null
};

$(function() {
  $('#routerSelect').change(function() {
    setDisplayOptions('byRouter', $('#routerSelect').val());
  });

  $('#statusCodeSelect').change(function() {
    setDisplayOptions('byStatusCode', $('#statusCodeSelect').val());
  });

  $('#instanceSelect').change(function() {
    setDisplayOptions('byInstance', $('#instanceSelect').val());
  });
});

Highcharts.setOptions({
  global: {
    useUTC: false
  }
});

$.get('lastDayStatistics.json', function(data) {
  var flattenedLogs = flattenLogs(data, initialData);

  initialData.routers = initialData.routers.concat(flattenedLogs.routers);
  initialData.cloudApi = initialData.cloudApi.concat(flattenedLogs.cloudApi);

  updateOptions();
  displayCharts();
});

function displayCharts() {
  var byRouter = displayOptions.byRouter;
  var byInstance = displayOptions.byInstance;
  var byStatusCode = displayOptions.byStatusCode;

  var clonedInitialData = _.cloneDeep(initialData);

  var unmeragedRouterData = filterByInstance(clonedInitialData.routers, byInstance);
  var unmeragedCloudData = filterByInstance(clonedInitialData.cloudApi, byInstance);

  unmeragedRouterData = filterByRouter(unmeragedRouterData, byRouter);
  unmeragedRouterData = filterByStatusCode(unmeragedRouterData, byStatusCode);

  var routerData = mergeInstances(_.cloneDeep(unmeragedRouterData));
  var cloudData = mergeInstances(_.cloneDeep(unmeragedCloudData));

  buildCacheOnRouterData(unmeragedRouterData);
  buildCacheOnRouterData(routerData);

  $('#routerSuccessAndError').highcharts({
    title: {
      text: '路由请求量'
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: '次数'
      }
    },
    series: fillZeroForSeries((function() {
      if (byInstance == '*') {
        return counterToSortedArray(initialData.allInstances).slice(0, lineChartItemLimit).map(function(instanceInfo) {
          return {
            name: instanceInfo.name,
            data: _.where(unmeragedRouterData, {instance: instanceInfo.name}).map(function(log) {
              return {
                x: log.createdAt.getTime(),
                y: requestsCountByType(log)
              };
            })
          };
        });
      } else if (byStatusCode == '*') {
        return counterToSortedArray(initialData.allStatusCodes).slice(0, lineChartItemLimit).map(function(sutatuCodeInfo) {
          return {
            name: sutatuCodeInfo.name,
            data: routerData.map(function(log) {
              return {
                x: log.createdAt.getTime(),
                y: _.sum(_.map(log.urls, sutatuCodeInfo.name))
              };
            })
          };
        });
      } else if (byRouter == '*') {
        return counterToSortedArray(initialData.allRouters).slice(0, lineChartItemLimit).map(function(routerInfo) {
          return {
            name: routerInfo.name,
            data: routerData.map(function(log) {
              var urlLog = _.findWhere(log.urls, {url: routerInfo.name});

              return {
                x: log.createdAt.getTime(),
                y: urlLog ? requestsCountByType(urlLog) : 0
              };
            })
          };
        });
      } else if (byStatusCode) {
        return [{
          name: byStatusCode,
          data: routerData.map(function(log) {
            return {
              x: log.createdAt.getTime(),
              y: _.sum(_.map(log.urls, byStatusCode))
            };
          })
        }];
      } else {
        return responseTypes.map(function(type) {
          return {
            name: type,
            data: routerData.map(function(log) {
              return {
                x: log.createdAt.getTime(),
                y: log[type]
              };
            })
          };
        });
      }
    })())
  });

  return;

  $('#routerResponseTime').highcharts({
    chart: {
      type: 'area'
    },
    title: {
      text: '路由平均响应时间'
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: '时间（毫秒）'
      }
    },
    series: [{
      name: 'responseTime',
      data: routerData.map(function(log) {
        return {
          x: log.createdAt.getTime(),
          y: log.responseTime
        };
      })
    }]
  });

  $('#routerPie').highcharts({
    chart: {
      type: 'pie'
    },
    title: {
      text: '路由分布'
    },
    series: [{
      name: 'Routers',
      data: _(routerData).pluck('urls').flatten().groupBy('urlPattern').map(function(urls, urlPattern) {
        return {
          name: urlPattern,
          y: (function() {
            if (displayOptions.byStatusCode)
              return _.sum(urls, displayOptions.byStatusCode);
            else
              return _.sum(urls, requestCount);
          })()
        };
      }).filter(function(item) {
        return item.y > 0;
      }).sortBy('y').slice(-pieChartItemLimit).value()
    }]
  });

  $('#statusPie').highcharts({
    chart: {
      type: 'pie'
    },
    title: {
      text: '路由响应代码分布'
    },
    series: [{
      name: 'StatusCode',
      data: _(_(routerData).pluck('urls').flatten().reduce(function(grouped, url) {
        _.each(url, function(value, key) {
          if (isFinite(parseInt(key)) && (!displayOptions.byStatusCode || displayOptions.byStatusCode == key)) {
            if (grouped[key])
              grouped[key] += value;
            else
              grouped[key] = value;
          }
        });
        return grouped;
      }, {})).map(function(value, key) {
        return {
          name: key,
          y: value
        };
      }).filter(function(item) {
        return item.y > 0;
      }).value()
    }]
  });

  $('#cloudSuccessAndError').highcharts({
    title: {
      text: '云调用次数'
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: '次数'
      }
    },
    series: responseTypes.map(function(type) {
      return {
        name: type,
        data: cloudData.map(function(log) {
          return {
            x: log.createdAt.getTime(),
            y: log[type]
          };
        })
      };
    })
  });

  $('#cloudResponseTime').highcharts({
    chart: {
      type: 'area'
    },
    title: {
      text: '云调用平均响应时间'
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: '时间（毫秒）'
      }
    },
    series: [{
      name: 'responseTime',
      data: cloudData.map(function(log) {
        return {
          x: log.createdAt.getTime(),
          y: log.responseTime
        };
      })
    }]
  });

  $('#cloudPie').highcharts({
    chart: {
      type: 'pie'
    },
    title: {
      text: '云调用分布'
    },
    series: [{
      name: 'Cloud',
      data: _(cloudData).pluck('urls').flatten().groupBy('urlPattern').map(function(urls, urlPattern) {
        return {
          name: urlPattern,
          y: _.sum(urls, requestCount)
        };
      }).filter(function(item) {
        return item.y > 0;
      }).sortBy('y').slice(-pieChartItemLimit).value()
    }]
  });

  $('#cloudStatusPie').highcharts({
    chart: {
      type: 'pie'
    },
    title: {
      text: '云调用响应分布'
    },
    series: [{
      name: 'CloudStatus',
      data: _(_(cloudData).pluck('urls').flatten().reduce(function(grouped, url) {
        responseTypes.forEach(function(type) {
          if (grouped[type])
            grouped[type] += url[type];
          else
            grouped[type] = url[type] || 0;
        });
        return grouped;
      }, {})).map(function(value, key) {
        return {
          name: key,
          y: value
        };
      }).value()
    }]
  });
}

function setDisplayOptions(name, value) {
  var domMapping = {
    byRouter: '#routerSelect',
    byStatusCode: '#statusCodeSelect',
    byInstance: '#instanceSelect'
  };

  displayOptions[name] = value;

  if (value == '*') { // 只能有一个筛选列为 *
    _(domMapping).keys().without(name).value().forEach(function(option) {
      if (displayOptions[option] == '*') {
        displayOptions[option] = '';
        $(domMapping[option]).val('');
      }
    });
  }

  displayCharts();
}

function updateOptions() {
  var syncToSelect = function(selectId, options) {
    var currentOptions = _.map($(selectId + ' > option'), 'value');

    counterToSortedArray(options).forEach(function(option) {
      if (!_.includes(currentOptions, option.name)) {
        var text = option.name + ' (' + option.count + ')';
        $(selectId).append($('<option></option>').attr('value', option.name).text(text));
      }
    });
  };

  syncToSelect('#routerSelect', initialData.allRouters);
  syncToSelect('#instanceSelect', initialData.allInstances);
  syncToSelect('#statusCodeSelect', initialData.allStatusCodes);
}

function filterByRouter(logs, byRouter) {
  if (_.includes(['', null, '*'], byRouter))
    return logs;

  return _.compact(logs.map(function(log) {
    var url = _.findWhere(log.urls, {url: byRouter});

    return _.extend(log, {
      urls: url ? [url] : []
    });
  }));
}

function filterByInstance(logs, byInstance) {
  if (_.includes(['', null, '*'], byInstance))
    return logs;

  return logs.map(function(log) {
    if (log.instance == byInstance) {
      return log;
    } else {
      return _.extend(log, {
        urls: []
      });
    }
  });
}

function filterByStatusCode(logs, byStatusCode) {
  if (_.includes(['', null, '*'], byStatusCode))
    return logs;

  return logs.map(function(log) {
    return _.extend(log, {
      urls: log.urls.map(function(url) {
        return _.pick(url, function(value, key) {
          if (isFinite(parseInt(key)) && key != byStatusCode)
            return false;
          else
            return true;
        });
      })
    })
  });
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
      result.push(log);
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

function fillZeroForSeries(series) {
  if (series.length == 1)
    return series;

  var existsPointX = _(series).map(function(serie) {
    return _.map(serie.data, 'x');
  }).flatten().uniq().value();

  series.forEach(function(serie) {
    var currentPointX = _.map(serie.data, 'x');

    existsPointX.forEach(function(x) {
      if (!_.includes(currentPointX, x)) {
        serie.data.push({
          x: x,
          y: 0
        });
      }
    });

    serie.data.sort(function(a, b) {
      return a.x - b.x;
    });
  });

  return series;
}

function buildCacheOnRouterData(routerData) {
  routerData.forEach(function (log) {
    var logRequests = 0;
    var logTotalResponseTime = 0;

    responseTypes.forEach(function(type) {
      log[type] = 0;
    });

    log.urls.forEach(function(url) {
      var urlRequests = 0;

      responseTypes.forEach(function(type) {
        url[type] = 0;
      });

      _.map(url, function(count, statusCode) {
        if (isFinite(parseInt(statusCode))) {
          var responseType = utils.typeOfStatusCode(parseInt(statusCode));
          url[responseType] += count;
          log[responseType] += count;
          urlRequests += count;
          logRequests += count;
        }
      });

      url.responseTime = url.totalResponseTime / urlRequests;
      logTotalResponseTime += url.totalResponseTime;
    });

    log.responseTime = logTotalResponseTime / logRequests;
  });
}
