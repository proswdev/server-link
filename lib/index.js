var promiseRetry = require('promise-retry');
var Promise = require('bluebird');
var request = require('superagent');
var _ = require('lodash');
require('superagent-as-promised')(request);

var stats = [
  'offline',
  'starting',
  'online',
  'error',
  'invalid'
];

function Link(app, status, path) {
  if (this instanceof Link) {
    this.status = status || 'online';
    if (app) {
      var self = this;
      app.get(path || '/serverlink', function (req, res) {
        res.status(200).send(self.status);
      });
    }
  } else {
    return new Link(app, status, path);
  }
}

Object.defineProperty(Link.prototype, 'status', {
  get: function() {
    return this._status;
  },
  set: function(status) {
    if (stats.indexOf(status) < 0) {
      throw new Error('Invalid server status');
    }
    this._status = status;
  }
});

Link.get = function(host, path) {
  return request
    .get(host + (path || '/serverlink'))
    .then(function (res) {
      var status,err;
      if (!res || res.status != 200 || stats.indexOf(res.text) < 0) {
        status = 'invalid';
      } else {
        status = res.text;
      }
      return status;
    })
    .catch(function(err) {
      return 'offline';
    });
};

Link.wait = function(hosts, path, options) {
  var multihost = Array.isArray(hosts);
  if (!multihost) {
    hosts = [ hosts ];
  }
  if (typeof path === 'object') {
    options = path;
    path = undefined;
  }
  var links = [];
  return Promise.map(hosts, function(host, index) {
    return promiseRetry(function (retry, number) {
      return request
        .get(host + (path || '/serverlink'))
        .then(function (res) {
          var status,err;
          if (!res || res.status != 200 || stats.indexOf(res.text) < 0) {
            status = 'invalid';
          } else {
            status = res.text;
          }
          links[index] = status;
          switch (status) {
            case 'offline':
            case 'starting':
              err = new Error('Server link not ready');
              err.code = 'LINKNOTREADY';
              err.retries = number;
              return retry(err);
              break;
            case 'online':
              return status;
              break;
            case 'invalid':
              err = new Error('Server link invalid');
              err.code = 'LINKINVALID';
              err.retries = number;
              throw err;
              break;
            case 'error':
              err = new Error('Server link error');
              err.code = 'LINKERROR';
              err.retries = number;
              throw err;
              break;
          }
        })
        .catch(function(err) {
          if (err.code !== 'LINKINVALID' && err.code !== 'LINKERROR') {
            err.retries = number;
            retry(err);
          }
          throw err;
        });
    }, options)
    .catch(function(err) {
      links[index] = err;
      throw err;
    });
  })
  .then(function() {
    return multihost ? links : links[0];
  })
  .catch(function(err) {
    if (multihost) {
      var err = new Error('Server links not ready [');
      var list = _.map(links, function(link, index) {
        return hosts[index] + ' - ' + (link.message || link);
      });
      err.message += list.join(', ') + ']';
      err.code = 'LINKSNOTREADY';
      err.links = links;
      throw err;
    } else {
      throw err;
    }
  });
};

module.exports = Link;
