'use strict';

var express = require('express');
var request = require('supertest');
var chai = require('chai');
var AV = require('leanengine');

var createCollector = require('../collector');
var sniper = require('../index');

chai.Should();
AV.initialize('hOm6fe8KE285nUXsB6AR267i', 'c7Y2X8NINFhCTGWsFSNLTUns', '5mSJOWdhxSqVyg4CQsu0tJNa');

var app = express();
var collector = createCollector();

app.use(sniper({
  AV: AV,
  collector: collector,
  rules: [
    {match: /^GET \/images/, ignore: true}
  ]
}));

app.use(asyncMiddleware);

app.use((function() {
  var router = express.Router();

  router.get('/', emptyResponse);

  router.use('/public', emptyResponse);

  router.use('/images', emptyResponse);

  router.use('/topic/:id', asyncMiddleware);

  return router.use('/2.0', (function() {
    var router = express.Router();

    router.use('/account', (function() {
      var router = express.Router();

      router.post('/at/@:account', asyncMiddleware, emptyResponse);

      return router.put('/:account/settings', asyncMiddleware, emptyResponse);
    })());

    return router.use('/topic', (function() {
      var router = express.Router();

      router.get('/:id', emptyResponse);

      router.post('/move/:from/to/:to?', asyncMiddleware, emptyResponse);

      return router.get('/reply/:replyId', emptyResponse);
    })());
  })());
})());

describe('request-url', function () {
  testUrlPattern('GET', '/', 'GET /');

  testUrlPattern('GET', '/public/jquery', 'GET /public/jquery');
  testUrlPattern('GET', '/public/jquery.js', 'GET *.js');
  testUrlPattern('GET', '/public/bootstrap.css', 'GET *.css');

  testUrlPattern('GET', '/images/background', null);

  testUrlPattern('POST', '/2.0/account/at/@leancloud', 'POST /2.0/account/at/@:account');

  testUrlPattern('PUT', '/2.0/account/15/settings', 'PUT /2.0/account/:account/settings');
  testUrlPattern('GET', '/2.0/account/15/settings', 'GET /2.0/account/15/settings');

  testUrlPattern('GET', '/2.0/topic/563e27fe60b259ca8e1cfb91', 'GET /2.0/topic/:id');
  testUrlPattern('GET', '/2.0/topic/1343', 'GET /2.0/topic/:id');

  testUrlPattern('POST', '/2.0/topic/move/a/to/b', 'POST /2.0/topic/move/:from/to/:to?');
  testUrlPattern('POST', '/2.0/topic/move/a/to/', 'POST /2.0/topic/move/:from/to/:to?');

  testUrlPattern('GET', '/2.0/topic/reply/1', 'GET /2.0/topic/reply/:replyId');
  testUrlPattern('GET', '/2.0/topic/reply/2', 'GET /2.0/topic/reply/:replyId');

  testUrlPattern('GET', '/2.0/posts/563e27fe60b259ca8e1cfb91', 'GET /2.0/posts/:objectId');
});

function testUrlPattern(method, url, urlPattern) {
  it(urlPattern, function(done) {
    request(app)[method.toLowerCase()](url).end(function(err) {
      if (urlPattern) {
        collector.flush().routers[0].url.should.be.equal(urlPattern);
      } else {
        collector.flush().routers.should.be.eql([]);
      }
      done(err);
    });
  });
}

function emptyResponse(req, res) {
  res.send();
}

function asyncMiddleware(req, res, next) {
  setTimeout(next, 1);
}
