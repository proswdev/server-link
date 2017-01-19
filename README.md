# server-link #

Manage links between client and servers to allow client to wait until linked servers are ready

Very useful for installations involving multiple servers that should start in a particular sequence.  
Linked [Docker](http://www.docker.com) containers is a very typical use case for this.

## Installation ##

```
$ npm install server-link
```

## Usage ##

Simply setup link support on server that client depends on:

```javascript
// == Server application ==
var express = require('express');
var app = express();
...
// Setup link support
require('server-link')(app);

// Perform normal server init and startup
app.route(...), app.use(...) etc
app.listen(....)
```

Now client can wait until linked server is ready:

```javascript
// == Client application ==
require('server-link').wait('http://localhost:3000').then(function() {
  // Linked server is ready
})
.catch(function(err) {
  // Connection with linked server failed 
});
```

Client can wait for multiple servers. The returned promise isn't resolved until all linked servers are ready:

```javascript
// == Client application ==
require('server-link').wait([
  'http://www.someserver.com:3000', 
  'http://www.anotherserver.com:4000'
])
.then(function() {
  // All linked servers are ready
})
.catch(function(err) {
  // Connection with one or more linked servers failed
});
```
## Server link status ##
By default, server is assumed to be ready as soon as it starts listening on a socket and routing incoming requests. This behavior can be changed by providing a link status during setup as follows:

```javascript
// == Server application ==
var express = require('express');
var app = express();
var link = require('server-link')(app, 'starting');
```
Now the server won't report itself as ready until the link status is manually changed from 'starting' to 'online' based on your server specific conditions:
```javascript
// == Server application ==
link.status = 'online';
```
Server-link supports the following link status values:
- `'offline'`: The linked server is not responding to link requests
- `'starting'`: The linked server is starting up but not yet ready
- `'online'`: The linked server is ready for incoming requests
- `'error'`: The linked server is not ready due to an internal error
- `'invalid'`: The linked server sends invalid response to link requests

Assigning any other value to `link.status` will result in an error exception. The client will wait until the server reports status 'online'. As long as status 'offline' or 'starting' is reported, the client will continue to poll the server periodically until max number of retries is reached, based on the specified retry options (see below). When status 'error' or 'invalid' is reported, the client will abort the wait immediately and report a link failure.  

The client can poll the current link status at any time:
```javascript
// == Client application ==
require('server-link').get('http://someserver.com:300').then(function(status) {
  console.log('link status=' + status);
});
```
## Server link path ##
By default, link status requests are routed through path `'/serverlink'` on the server. A custom path can be used as long as both the client and server are setup with the same path as follows: 
```javascript
// == Server application ==
require('server-link')(app, '', '/custom/link/path');
```
```javascript
// == Client application ==
require('server-link').wait('http://someserver.com:3000', '/custom/link/path');
```
Please note that server URL should not contain any path or trailing '/' and custom path should start with '/'.
## Server link retry options ##
Server-link uses NPM package [retry](https://www.npmjs.com/package/retry) to perform retries during waits by the client until the linked server is ready. Retry options can be specified in the wait call and are passed on directly to this package:
```javascript
// == Client application ==
require('server-link').wait('http://someserver.com:3000', {
  retries: 2,       // Max nbr of times to retry (default 10)
  factor: 1,        // Exponential factor (default 2)
  minTimeout: 500,  // Time to wait before first retry (default 1000ms)
  maxTimeout: 500,  // Max time to wait between retries (default infinity)
  randomize: true   // Randomize wait time with factor between 1-2 (default false)
);
```
Please see the [retry](https://www.npmjs.com/package/retry) package for option details.
## Server link errors ##
Attempts by the client to wait for a linked server could result in the returned promise to be rejected with various errors. In addition to the typical network related errors, server-link my also report one of the following error instances:
- err.code = 'LINKNOTREADY' - Max wait time/retries reached before server reported status 'online'  
err.number = Number of times client tried to poll the server before failure

- err.code = 'LINKINVALID' - Server sent invalid response to link status requests  
err.number = Number of times client tried to poll the server before failure

- err.code = 'LINKERROR' - Server reported an internal error  
err.number = Number of times client tried to poll the server before failure

- err.code = 'LINKSNOTREADY' - Wait for multiple servers failed for one or more servers  
err.links = Array with an entry for each server the client is waiting for. The entry will contain an error instance as specified above if a link with the corresponding server failed.

## API reference ##
```javascript
var serverLink = require('server-link');
```
**serverLink(app, [status], [path])**  
Enables link support on the server  
`app` specifies the express() application for the server  
`status` indicates the initial server status (default 'online')  
`path` is path on the server where link status requests are routed to (default '/serverlink')  
Returns a serverLink instance for this app. Use property *instance*.status to get & set current server status

**serverLink.wait(hosts, [path], [options])**  
Waits until specified linked server(s) is/are ready.  
`hosts` is either a string containing the host URL for a single linked server or an array of strings to wait for multiple servers. A host URL should only contain the base server URL with optional protocol and port but without path or trailing '/'.  
`path` is path on the server(s) where link status request are routed to (default '/serverlink')  
`options` are server retry options while waiting until ready. See [server link retry options](#server-link-retry-options) above for details.  
Returns a promise that is resolved when all specified servers are ready or rejected if one ore more linked servers failed.

**serverLink.get(host, [path])**  
`host` specifies the host URL for the linked server. The URLshould only contain the base server URL with optional protocol and port but without path or trailing '/'.  
`path` is path on the server where link status requests are routed to (default '/serverlink')  
Returns a promise that is resolved with the current link status for specified server.
