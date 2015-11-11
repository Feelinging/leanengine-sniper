var chai = require('chai');

var utils = require('../public/utils');

chai.Should();

describe('utils', function() {
  it('parseTimeString', function() {
    utils.parseTimeString('').getTime().should.be.closeTo(Date.now(), 10);
    utils.parseTimeString(null).getTime().should.be.closeTo(Date.now(), 10);
    utils.parseTimeString('now').getTime().should.be.closeTo(Date.now(), 10);

    utils.parseTimeString('+1d2h3m').getTime().should.be.closeTo(Date.now() + 93780000, 10);
    utils.parseTimeString('+1d28m').getTime().should.be.closeTo(Date.now() + 88080000, 10);
    utils.parseTimeString('-1d').getTime().should.be.closeTo(Date.now() - 86400000, 10);
    utils.parseTimeString('-2h').getTime().should.be.closeTo(Date.now() - 7200000, 10);
    utils.parseTimeString('-11m').getTime().should.be.closeTo(Date.now() - 660000, 10);

    utils.parseTimeString('Wed Nov 11 2015 14:06:44 GMT+0800').getTime().should.be.equal(1447222004000);
    utils.parseTimeString('2015-11-11T06:06:44.857Z').getTime().should.be.equal(1447222004857);
    utils.parseTimeString('1447221610024').getTime().should.be.equal(1447221610024);
    utils.parseTimeString(1447221610024).getTime().should.be.equal(1447221610024);
  });
});
