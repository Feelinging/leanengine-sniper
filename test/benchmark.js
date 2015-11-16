'use strict';

var express = require('express');
var request = require('supertest');
var async = require('async');
var AV = require('leanengine');
var _ = require('underscore');

var sniper = require('../index');

AV.initialize('hOm6fe8KE285nUXsB6AR267i', 'c7Y2X8NINFhCTGWsFSNLTUns', '5mSJOWdhxSqVyg4CQsu0tJNa');

var app = express();

app.use(sniper({
  AV: AV
}));

app.use(asyncMiddleware);

app.get('/topic/:id', emptyResponse);
app.post('/topic/create', asyncMiddleware, emptyResponse);

app.use(emptyResponse);

describe('benchmark', function () {
  this.timeout(30000);

  it('1000 requests', function(done) {
    async.timesLimit(1000, 100, function(times, next) {
      async.parallel([
        function(callback) {
          request(app).get('/topic/563e27fe60b259ca8e1cfb91').end(callback);
        },
        function(callback) {
          request(app).post('/topic/create').end(callback);
        }
      ], next);
    }, done);
  });

  it('1000 requests on 50 unique url', function(done) {
    async.timesLimit(1000, 20, function(times, next) {
      request(app).get('/pages/' + _.random(0, 50)).end(next);
    }, done);
  });
});

function emptyResponse(req, res) {
  res.send();
}

function asyncMiddleware(req, res, next) {
  setTimeout(next, 1);
}
