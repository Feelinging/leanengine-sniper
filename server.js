'use strict';

var basicAuth = require('basic-auth');
var express = require('express');
var Redis = require('ioredis');
var http = require('http');
var _ = require('underscore');

var utils = require('./public/utils');

module.exports = function(AV, options) {
  var Storage = AV.Object.extend(options.className);
  var router = new express.Router();

  var authenticate = function(req, res, next) {
    var credentials = basicAuth(req);

    if (credentials && credentials.name == AV.applicationId && credentials.pass == AV.masterKey) {
      next();
    } else {
      res.header('WWW-Authenticate', 'Basic');
      res.status(401).json({
        code: 401, error: "Unauthorized."
      });
    }
  };

  router.use('/__lcSniper', authenticate, express.static(__dirname + '/public'));

  router.get('/__lcSniper/lastDayStatistics.json', authenticate, function (req, res) {
    var query = new AV.Query(Storage);
    query.greaterThan('createdAt', new Date(Date.now() - 24 * 3600 * 1000)).limit(1000).find().then(function(data) {
      res.json(data);
    });
  });

  router.get('/__lcSniper/realtime.json', authenticate, function(req, res) {
    if (!options.redis) {
      return res.send('Need Redis, see the README.md of leanengine-sniper');
    }

    try {
      var subscriber = new Redis(options.redis);
      var pushQueue = [];

      var intervalId = setInterval(function() {
        var log = utils.mergeBuckets(pushQueue.map(function(instanceBucket) {
          return {instances: [instanceBucket]};
        }), true);

        log.createdAt = new Date();
        pushQueue = [];

        res.write('id: ' + _.uniqueId() + '\n');
        res.write('data: ' + JSON.stringify(log) + '\n\n');
      }, options.realtimeCycle);

      subscriber.subscribe('__lcSniper:realtime', function(err) {
        if (err) console.log(err);
      });

      subscriber.on('message', function(channel, message) {
        pushQueue.push(JSON.parse(message));
      });

      req.socket.setTimeout(3600000);

      req.on('close', function() {
        subscriber.quit();
        clearInterval(intervalId);
      });

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive'
      });

      res.write('\n');
    } catch (err) {
      console.error(err.stack ? err.stack : err);
    }
  });

  return router;
};
