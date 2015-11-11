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

  $('#logsFrom, #logsTo').keypress(function(event) {
    if(event.which == 13)
      $('#filterByRange').click();
  });

  $('#filterByRange').click(function() {
    if (realtimeStream)
      return;

    displayOptions.logsFrom = utils.parseTimeString($('#logsFrom').val());
    displayOptions.logsTo = utils.parseTimeString($('#logsTo').val());

    if (_.isEmpty(initialData.routers))
      return useCloudData();

    var currentFrom = new Date(_.first(initialData.routers).createdAt.getTime() - 300000);
    var currentTo = new Date(_.last(initialData.routers).createdAt.getTime() + 300000);

    // 如果新的筛选范围小于当前范围（接受最多五分钟的误差），则在客户端筛选数据，不发起请求
    if (displayOptions.logsFrom >= currentFrom && (displayOptions.logsTo <= currentTo || $('#logsTo').val() == 'now')) {
      var filterLogs = function(log) {
        return log.createdAt > displayOptions.logsFrom && log.createdAt < displayOptions.logsTo;
      };

      _.extend(initialData, {
        routers: initialData.routers.filter(filterLogs),
        cloudApi: initialData.cloudApi.filter(filterLogs),
        allRouters: {},
        allInstances: {},
        allStatusCodes: {}
      })

      buildCounters(initialData.routers, initialData);

      resetOptions();
      updateOptions();
      displayCharts();
    } else {
      useCloudData();
    }
  });

  $('#useRealtimeData').change(function() {
    if ($('#useRealtimeData').is(':checked')) {
      useRealtimeData();
      $('#filterByRange').prop('disabled', true);
    } else {
      useCloudData();
      $('#filterByRange').prop('disabled', false);
    }
  });
});

function fillLogsFromTo(time) {
  $(displayOptions.currentLogsFromToField).val(new Date(time).toJSON());
  displayOptions.currentLogsFromToField = displayOptions.currentLogsFromToField == '#logsFrom' ? '#logsTo' : '#logsFrom';
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

function resetOptions() {
  $('#routerSelect option:gt(1)').remove();
  $('#instanceSelect option:gt(1)').remove();
  $('#statusCodeSelect option:gt(1)').remove();

  $('#routerSelect').val('');
  $('#instanceSelect').val('');
  $('#statusCodeSelect').val('');

  displayOptions.byRouter = null;
  displayOptions.byInstance = null;
  displayOptions.byStatusCode = null;
}

function updateOptions() {
  var syncToSelect = function(selectId, options) {
    var currentOptions = _.map($(selectId + ' > option'), 'value');

    counterToSortedArray(options).forEach(function(option) {
      var text = option.name + ' (' + option.count + ')';

      if (!_.includes(currentOptions, option.name)) {
        $(selectId).append($('<option></option>').attr('value', option.name).text(text));
      } else {
        $(selectId + ' [value="' + option.name + '"]').text(text);
      }
    });
  };

  syncToSelect('#routerSelect', initialData.allRouters);
  syncToSelect('#instanceSelect', initialData.allInstances);
  syncToSelect('#statusCodeSelect', initialData.allStatusCodes);
}
