'use strict';

var basicAuth = require('basic-auth');
var express = require('express');

module.exports = function(options) {
  var routerCollector = options.routerCollector;
  var cloudCollector = options.cloudCollector;
  var AV = options.AV;

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

  router.get('/__lcSniper/recentStatistics', authenticate, function(req, res) {
    res.send(routerCollector.recentStatistics());
  });

  router.get('/__lcSniper/lastDayStatistics.json', authenticate, function (req, res) {
    routerCollector.getLastDayStatistics().then(function(routerData) {
      cloudCollector.getLastDayStatistics().then(function(cloudData) {
        res.json({
          routerData: routerData,
          cloudData: cloudData
        });
      });
    });
  });

  return router;
};
