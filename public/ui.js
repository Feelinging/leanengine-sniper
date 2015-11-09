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

  $('#useRealtimeData').change(function() {
    if ($('#useRealtimeData').is(':checked')) {
      useRealtimeData();
    } else {
      useCloudData();
    }
  });
});

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
