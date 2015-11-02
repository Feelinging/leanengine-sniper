'use strict';
/* globals $, Highcharts, _ */

var responseTypes = ['success', 'clientError', 'serverError'];
var pieChartItemLimit = 15;

var initialData = {
  routerData: [],
  cloudData: []
};

var displayOptions = {
  // 路由筛选，由 filterByRouter 实现
  byRouter: null,
  // 路由状态码筛选，在 displayCharts 中实现
  byStatusCode: null,
  // 应用实例筛选，在 mergeInstancesPoint 中实现
  byInstance: null
};

$(function() {
  $('#routerSelect').change(function() {
    displayOptions.byRouter = $('#routerSelect').val();
    displayCharts();
  });

  $('#statusCodeSelect').change(function() {
    displayOptions.byStatusCode = $('#statusCodeSelect').val();
    displayCharts();
  });

  $('#instanceSelect').change(function() {
    displayOptions.byInstance = $('#instanceSelect').val();
    displayCharts();
  });
});

Highcharts.setOptions({
  global: {
    useUTC: false
  }
});

$.get('lastDayStatistics.json', function(data) {
  initialData = data;

  _(initialData.routerData).pluck('urls').flatten().pluck('urlPattern').uniq().value().forEach(function(name) {
    $('#routerSelect').append($("<option></option>").attr("value", name).text(name));
  });

  _(initialData.routerData).pluck('instance').uniq().value().forEach(function(name) {
    $('#instanceSelect').append($("<option></option>").attr("value", name).text(name));
  });

  displayCharts();
});

function displayCharts() {
  var routerData = mergeInstancesPoint(initialData.routerData, displayOptions.byInstance);
  var cloudData = mergeInstancesPoint(initialData.cloudData, displayOptions.byInstance);

  if (displayOptions.byRouter)
    routerData = filterByRouter(routerData, displayOptions.byRouter);

  $('#routerSuccessAndError').highcharts({
    title: {
      text: '路由访问量'
    },
    xAxis: {
      type: 'datetime',
    },
    yAxis: {
      title: {
        text: '次数'
      }
    },
    series: (function() {
      if (!displayOptions.byStatusCode) {
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
      } else {
        return [{
          name: displayOptions.byStatusCode,
          data: routerData.map(function(log) {
            return {
              x: log.createdAt.getTime(),
              y: _.sum(log.urls, displayOptions.byStatusCode)
            };
          })
        }];
      }
    })()
  });

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
              return _.sum(urls, function(url) {
                return url.success + url.clientError + url.serverError;
              });
          })()
        };
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
          y: _.sum(urls, function(url) {
            return url.success + url.clientError + url.serverError;
          })
        };
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
            grouped[type] = url[type];
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

function filterByRouter(routerData, byRouter) {
  return _.compact(routerData.map(function(log) {
    var url = _.findWhere(log.urls, {urlPattern: byRouter});

    if (url)
      return _.extend({}, log, {urls: [url]});
    else
      return null;
  }));
}

function mergeInstancesPoint(data, filterByInstance) {
  var result = [];

  if (filterByInstance)
    data = _.where(data, {instance: filterByInstance});

  data.forEach(function(log) {
    log.createdAt = new Date(log.createdAt);

    var lastLog = _.last(result);

    if (lastLog && lastLog.instance != log.instance) {
      mergeRecord(lastLog, log);
    } else {
      result.push(log);
    }
  });

  return result;
}

function mergeRecord(target, source) {
  source.urls.forEach(function(url) {
    var targetUrl = _.findWhere(target.urls, {urlPattern: url.urlPattern});

    if (targetUrl) {
      var totalResponseTime = target.responseTime * requestCount(target);
      totalResponseTime += source.responseTime * requestCount(source);

      _.each(url, function(value, key) {
        if (isFinite(parseInt(key)) || _.contains(responseTypes, key)) {
          if (targetUrl[key])
            targetUrl[key] += value;
          else
            targetUrl[key] = value;
        }
      });

      responseTypes.forEach(function(field) {
        target[field] = _.sum(target.urls, field);
      });

      target.responseTime = totalResponseTime / requestCount(target);
    } else {
      target.urls.push(url);
    }
  });
}

function requestCount(urlStat) {
  var result = 0;
  responseTypes.forEach(function(field) {
    if (urlStat[field])
      result += urlStat[field];
  });
  return result;
}
