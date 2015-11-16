'use strict';

var chai = require('chai');
var _ = require('underscore');

var createCollector = require('../collector');

chai.Should();

describe('collector', function () {
  var collector = createCollector('collectorTest');

  it('logRouter', function() {
    collector.logRouter('POST /topic/create', 200, 100);
    collector.logRouter('POST /topic/create', 200, 150);
    collector.logRouter('POST /topic/create', 400, 10);
    collector.logRouter('GET /topic/:id', 404, 10);
  });

  it('logCloudApi', function() {
    collector.logCloudApi('GET classes/Topic/:id', 'success', 15);
    collector.logCloudApi('GET classes/Topic/:id', 'success', 20);
    collector.logCloudApi('GET classes/Topic/:id', 'clientError', 10);
  })

  it('flush', function() {
    var bucket = collector.flush();
    var realtimeBucket = collector.flushRealtime();

    realtimeBucket.should.not.equal(bucket);
    realtimeBucket.routers[0].should.not.equal(_.findWhere(bucket.routers, {url: realtimeBucket.routers[0].url}))

    _.sortBy(bucket.routers, 'url').should.be.eql(_.sortBy([
      {url: 'POST /topic/create', '200': 2, '400': 1, totalResponseTime: 260},
      {url: 'GET /topic/:id', '404': 1, totalResponseTime: 10},
    ], 'url'));

    _.sortBy(bucket.cloudApi, 'url').should.be.eql(_.sortBy([
      {url: 'GET classes/Topic/:id', 'success': 2, 'clientError': 1, totalResponseTime: 45}
    ], 'url'));

    collector.flush().should.be.eql({
      instance: 'collectorTest',
      routers: [],
      cloudApi: []
    });
  });
});
