'use strict';

var should = require('should');
var express = require('express');
var Promise = require('bluebird');
var ServerLink = require('../lib');

var PORT = 9000;

var retry1 = {
  retries: 1,
  minTimeout: 500
};

var retry2 = {
  retries: 2,
  factor: 1,
  minTimeout: 500,
  maxTimeout: 500
};

describe("server-link", function() {

  it ('should establish link using default settings', function() {
    var app = express();
    ServerLink(app);
    var server = app.listen(PORT);
    return ServerLink.wait('localhost:' + PORT).then(function(results) {
      return results.should.equal('online');
    })
    .finally(function() {
      server.close();
    })
  });

  it ('should establish link using custom endpoint', function() {
    var app = express();
    ServerLink(app, '', '/mystatus');
    var server = app.listen(PORT);
    return ServerLink.wait('localhost:' + PORT, '/mystatus').then(function(results) {
      return results.should.equal('online');
    })
    .finally(function() {
      server.close();
    })
  });

  it ('should establish multiple links using default settings', function() {
    var app1 = express();
    var app2 = express();
    ServerLink(app1);
    ServerLink(app2);
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'localhost:' + port2
    ]).then(function(results) {
      return results.should.eql(['online', 'online']);
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should establish multiple links using custom endpoint', function() {
    var app1 = express();
    var app2 = express();
    ServerLink(app1, '', '/mylink');
    ServerLink(app2, '', '/mylink');
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'localhost:' + port2
    ], '/mylink').then(function(results) {
      return results.should.eql(['online', 'online']);
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should establish link with custom linker', function() {
    var retries = 0;
    return ServerLink.wait('dummyHost', retry2, function(host, index, number) {
      host.should.eql('dummyHost');
      index.should.eql(0);
      number.should.eql(++retries);
      this.should.match({
        hosts: [ host ],
        path: '/serverlink',
        options: retry2
      });
      return retries < 2 ? 'starting' : 'online';
    }).then(function(results) {
      retries.should.equal(2);
      return results.should.equal('online');
    })
  });

  it ('should establish multiple links with custom linker', function() {
    var app1 = express();
    var app2 = express();
    ServerLink(app1);
    ServerLink(app2);
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'custom1',
      'localhost:' + port2,
      'custom2'
    ], retry2, function(host, index, number) {
      index.should.be.below(4);
      if (index === 1) {
        host.should.equal('custom1');
        number.should.equal(1);
        return 'online';
      }
      else if (index === 3) {
        host.should.equal('custom2');
        number.should.be.belowOrEqual(2);
        return new Promise(function(resolve) {
          resolve(number < 2 ? 'starting' : 'online');
        })
      }
    }).then(function(results) {
      return results.should.eql(['online', 'online', 'online', 'online']);
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should fail link at wrong endpoint', function() {
    var app = express();
    ServerLink(app);
    var server = app.listen(PORT);
    return ServerLink.wait('localhost:' + PORT, '/bogus', retry1).then(function() {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
    })
    .finally(function() {
      server.close();
    });
  });

  it ('should fail multiple links at wrong endpoint', function() {
    var app1 = express();
    var app2 = express();
    ServerLink(app1, '', '/bogus');
    ServerLink(app2, '', '/bogus');
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'localhost:' + port2
    ], retry1).then(function(results) {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
      err.code.should.equal('LINKSNOTREADY');
      err.links.should.be.an.Array();
      if (err.links[0]) {
        err.links[0].should.be.an.instanceOf(Error);
      }
      if (err.links[1]) {
        err.links[1].should.be.an.instanceOf(Error);
      }
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should wait for linked server ready', function() {
    var app = express();
    var link = ServerLink(app, 'starting');
    var server = app.listen(PORT);
    return ServerLink.wait('localhost:' + PORT, retry2).then(function() {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
      err.retries.should.equal(3);
      link.status = 'online';
      return ServerLink.wait('localhost:' + PORT, retry1);
    })
    .finally(function() {
      server.close();
    });
  });

  it ('should wait for multiple linked server ready', function() {
    var app1 = express();
    var app2 = express();
    var link1 = ServerLink(app1);
    var link2 = ServerLink(app2, 'starting');
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'localhost:' + port2
    ], retry2).then(function() {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
      err.code.should.equal('LINKSNOTREADY');
      err.links.should.be.an.Array();
      err.links.length.should.equal(2);
      err.links[0].should.equal('online');
      err.links[1].should.be.an.instanceOf(Error);
      err.links[1].retries.should.equal(3);
      link2.status = 'online';
      return ServerLink.wait([
        'localhost:' + port1,
        'localhost:' + port2
      ]).then(function(results) {
        return results.should.eql(['online', 'online']);
      });
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should report errors correctly with multiple links and custom linker', function() {
    var app1 = express();
    var app2 = express();
    ServerLink(app1);
    ServerLink(app2);
    var port1 = PORT;
    var port2 = PORT + 1;
    var server1 = app1.listen(port1);
    var server2 = app2.listen(port2);
    return ServerLink.wait([
      'localhost:' + port1,
      'custom1',
      'localhost:' + port2,
      'custom2'
    ], retry2, function(host, index, number) {
      index.should.be.below(4);
      if (index === 1) {
        host.should.equal('custom1');
        number.should.equal(1);
        return 'online';
      }
      else if (index === 3) {
        host.should.equal('custom2');
        number.should.be.belowOrEqual(3);
        return new Promise(function(resolve) {
          resolve('offline');
        })
      }
    }).then(function(results) {
      throw new Error('link should have failed');
    }).catch(function(err) {
      err.code.should.equal('LINKSNOTREADY');
      err.links.should.be.an.Array();
      err.links.length.should.equal(4);
      err.links[0].should.equal('online');
      err.links[1].should.equal('online');
      err.links[2].should.equal('online');
      err.links[3].should.be.an.instanceOf(Error);
      err.links[3].retries.should.equal(3);
    })
    .finally(function() {
      server1.close();
      server2.close();
    });
  });

  it ('should throw error setting invalid status', function() {
    (function() {
      ServerLink().status = 'bogus';
    }).should.throw();
  });

  it ('should fail-no-retry with invalid status', function() {
    var app = express();
    var server;
    app.get('/serverlink', function(req,res) {
      res.status(200).send('bogus');
    });
    return new Promise(function(resolve) {
      server = app.listen(PORT, resolve);
    })
    .then(function() {
      return ServerLink.wait('localhost:' + PORT, retry2);
    })
    .then(function() {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
      err.retries.should.equal(1);
    })
    .finally(function() {
      server.close();
    });
  });

  it ('should fail-no-retry with error status', function() {
    var app = express();
    ServerLink(app, 'error');
    var server = app.listen(PORT);
    return ServerLink.wait('localhost:' + PORT, retry2).then(function() {
      throw new Error('link should have failed');
    })
    .catch(function(err) {
      err.retries.should.equal(1);
    })
    .finally(function() {
      server.close();
    });
  });

  it ('should be able to get proper server status', function() {
    var app = express();
    var host = 'localhost:' + PORT;
    var server,link;
    return ServerLink.get(host).then(function(status) {
      status.should.equal('offline');
      server = app.listen(PORT);
    })
    .then(function() {
      link  = ServerLink(app, 'starting');
      return ServerLink.get(host);
    })
    .then(function(status) {
      status.should.equal('starting');
      link.status = 'online';
      return ServerLink.get(host);
    })
    .then(function(status) {
      status.should.equal('online');
      link.status = 'error';
      return ServerLink.get(host);
    })
    .then(function(status) {
      status.should.equal('error');
    });
  });

});
