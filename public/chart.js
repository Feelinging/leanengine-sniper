Highcharts.setOptions({
  global: {
    useUTC: false
  }
});

function displayCharts() {
  var byRouter = displayOptions.byRouter;
  var byInstance = displayOptions.byInstance;
  var byStatusCode = displayOptions.byStatusCode;

  var unmeragedRouterData = filterLogs(initialData.routers, displayOptions);
  var unmeragedCloudData = filterLogs(initialData.cloudApi, displayOptions);

  var routerData = mergeInstances(unmeragedRouterData);
  var cloudData = mergeInstances(unmeragedCloudData);

  buildCacheOnLogs(unmeragedRouterData);
  buildCacheOnLogs(routerData);
  buildCacheOnLogs(cloudData);

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
        return forEachInstance(unmeragedRouterData, lineChartItemLimit, function(log) {
          return {
            x: log.createdAt.getTime(),
            y: requestsCountByType(log)
          };
        });
      } else if (byStatusCode == '*') {
        return counterToSortedArray(initialData.allStatusCodes).slice(0, lineChartItemLimit).map(function(sutatuCodeInfo) {
          return {
            name: sutatuCodeInfo.name,
            animation: false,
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
            animation: false,
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
          animation: false,
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
            animation: false,
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
        text: '毫秒'
      }
    },
    plotOptions: {
      series: {
        connectNulls: true,
        connectEnds: true
      }
    },
    series: (function() {
      if (byInstance == '*') {
        return forEachInstance(unmeragedRouterData, lineChartItemLimit, function(log) {
          return {
            x: log.createdAt.getTime(),
            y: log.responseTime || null
          };
        });
      } else if (byRouter == "*") {
        return counterToSortedArray(initialData.allRouters).slice(0, lineChartItemLimit).map(function(routerInfo) {
          return {
            name: routerInfo.name,
            animation: false,
            data: routerData.map(function(log) {
              var urlLog = _.findWhere(log.urls, {url: routerInfo.name});

              return {
                x: log.createdAt.getTime(),
                y: urlLog ? urlLog.responseTime : null
              };
            })
          };
        });
      } else {
        return [{
          name: 'Average',
          animation: false,
          data: routerData.map(function(log) {
            return {
              x: log.createdAt.getTime(),
              y: log.responseTime || null
            };
          })
        }];
      }
    })()
  });

  $('#instanceSuccessAndError').highcharts({
    chart: {
      type: 'column'
    },
    title: {
      text: '实例请求量'
    },
    xAxis: {
      type: 'category',
      labels: {
        rotation: -45
      }
    },
    yAxis: {
      title: {
        text: '次数'
      }
    },
    series: (function() {
      var instanceNames = _.map(counterToSortedArray(initialData.allInstances).slice(0, columnChartItemLimit), 'name');
      var series = {};

      var push = function(name, value) {
        if (series[name])
          series[name].push(value);
        else
          series[name] = [value];
      };

      if (byStatusCode == '*') {
        instanceNames.forEach(function(instance) {
          var logs = _.where(unmeragedRouterData, {instance: instance});
          var serie = {};

          logs.forEach(function (log) {
            log.urls.forEach(function(url) {
              _.map(url, function(count, statusCode) {
                if (isFinite(parseInt(statusCode)))
                  incrCounter(serie, statusCode, count);
              });
            });
          });

          _.map(serie, function(value, statusCode) {
            push(statusCode, {
              name: instance,
              y: value
            });
          });
        });
      } else {
        instanceNames.forEach(function(instance) {
          var logs = _.where(unmeragedRouterData, {instance: instance});

          if (byStatusCode) {
            push(byStatusCode, {
              name: instance,
              y: _.sum(logs, requestsCountByType)
            });
          } else {
            responseTypes.forEach(function(type) {
              push(type, {
                name: instance,
                y: _.sum(logs, type)
              });
            });
          }
        });
      }

      return _.map(series, function(values, key) {
        return {
          name: key,
          animation: false,
          data: values
        };
      });
    })()
  });

  $('#instanceResponseTime').highcharts({
    chart: {
      type: 'column'
    },
    title: {
      text: '实例平均响应时间'
    },
    xAxis: {
      type: 'category',
      labels: {
        rotation: -45
      }
    },
    yAxis: {
      title: {
        text: '毫秒'
      }
    },
    series: [{
      name: 'Average',
      animation: false,
      data: _.sortByOrder(counterToSortedArray(initialData.allInstances).slice(0, columnChartItemLimit).map(function(instanceInfo) {
        var logs = _.where(unmeragedRouterData, {instance: instanceInfo.name});

        var totalRequests = _.sum(logs.map(requestsCountByType));
        var totalResponseTime = _.sum(logs.map(function(log) {
          return log.responseTime * requestsCountByType(log);
        }));

        return {
          name: instanceInfo.name,
          y: totalResponseTime / totalRequests
        };
      }).filter(function (item) {
        return isFinite(item.y);
      }), 'y', 'desc')
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
      animation: false,
      data: _(routerData).map('urls').flatten().groupBy('url').map(function(urls, url) {
        return {
          name: url,
          y: _.sum(urls, requestsCountByStatus)
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
      name: 'statusCode',
      animation: false,
      data: (function() {
        var statusCodes = {};

        _(routerData).map('urls').flatten().value().forEach(function(url) {
          _.each(url, function(value, key) {
            if (isFinite(parseInt(key)))
              incrCounter(statusCodes, key, value);
          });
        });

        return _(statusCodes).map(function(value, key) {
          return {
            name: key,
            y: value
          };
        }).filter(function(item) {
          return item.y > 0;
        }).value();
      })()
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
        animation: false,
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
        text: '毫秒'
      }
    },
    plotOptions: {
      series: {
        connectNulls: true,
        connectEnds: true
      }
    },
    series: [{
      name: 'Average',
      animation: false,
      data: cloudData.map(function(log) {
        return {
          x: log.createdAt.getTime(),
          y: log.responseTime || null
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
      name: 'url',
      animation: false,
      data: _(cloudData).map('urls').flatten().groupBy('url').map(function(urls, url) {
        return {
          name: url,
          y: _.sum(urls, requestsCountByType)
        };
      }).filter(function(item) {
        return item.y > 0;
      }).sortBy('y').slice(-pieChartItemLimit).value()
    }]
  });
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

function forEachInstance(logs, limit, callback) {
  return counterToSortedArray(initialData.allInstances).slice(0, limit).map(function(instanceInfo) {
    return {
      name: instanceInfo.name,
      animation: false,
      data: _.where(logs, {instance: instanceInfo.name}).map(callback)
    };
  });
}
