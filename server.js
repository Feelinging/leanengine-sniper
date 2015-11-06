'use strict';

var basicAuth = require('basic-auth');
var express = require('express');
var http = require('http');

module.exports = function(AV, redis) {
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

  return router;
};
