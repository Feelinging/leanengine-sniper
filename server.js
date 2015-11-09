'use strict';

var basicAuth = require('basic-auth');
var express = require('express');
var Redis = require('ioredis');
var http = require('http');

module.exports = function(AV, redisOptions) {
  var Storage = AV.Object.extend('LeanEngineSniper');
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
    try {
      var subscriber = new Redis(redisOptions);
      var messageId = 0;

      subscriber.subscribe('__lcSniper:realtime', function(err) {
        if (err) console.log(err);
      });

      subscriber.on('message', function(channel, message) {
        res.write('id: ' + ++messageId + '\n');
        res.write('data: ' + message + '\n\n');
      });

      req.socket.setTimeout(3600000);

      req.on('close', function() {
        subscriber.quit();
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
