# dockerizer

[![Build Status](https://travis-ci.org/kesarion/dockerizer.svg?branch=master)](https://travis-ci.org/kesarion/dockerizer)

Docker client and programmatic dockerizer

## Install

npm install dockerizer --save

## Usage

```javascript
var co = require("co"); // I recommend using this package with 'co' or async+await from ES7
var request = require("request"); // for communicating with containers

var Docker = require("dockerizer"); // Docker is a class

co(function *() {
    let docker = new Docker({ uri: "http://unix:/var/run/docker.sock:" }); // the default unix socket uri for docker on linux
    
    // with an app path
    yield docker.dockerize("/path/to/my/app", { port: 9000 });
    
    // Now you can communicate with your app using request() or any other means on http://localhost:9000
    
    // with an app string
    let app = "var app = require('express')(); app.get('/', (req, res) => res.send('Hello world!')); app.listen(8080);";
    let package = '{ "dependencies": { "express": "*" } }';
    
    let id = docker.dockerize(app, { package: package }); // running on port 3000 by default
    
    let result = yield promisify(request, ["http://localhost:3000"]);
    
    console.log(result.body); // Hello world!
});

// You can promisify most functions with a callback parameter at the end
function promisify (fun, args) {
    return new Promise ((resolve, reject) => {
        args.push((err, res) => err ? reject(err) : resolve(res));
        fun.apply(this, args);
    });
}
```

### Dockerfile

The following dockerfile is provided by default:

```
FROM tatsushid/tinycore-node:4.2
COPY /app /app
RUN cd /app; npm install
EXPOSE  8080
CMD ["node", "/app"]
```

You can provide your own dockerfile:
```javascript
docker.dockerize(app, { dockerfile: `my dockerfile as a string` });
```

## Docker client

You can use docker.request() to issue any requests to the [Docker Remote API](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21).
```javascript
let containers = yield docker.request("/containers/json?all=1"); // get all (running and stopped) containers; returns the body by default (the containers array here); GET by default
console.log(containers);

let res = yield docker.request(`/containers/${id}/stop`, { method 'POST', result: true }); // you have to specify non-GET methods; here we're requesting the full result instead the body
console.log(res.statusCode, res.body); // we can check any request result properties now
```

docker.request(path, options) supports any [request](https://github.com/request/request) [options](https://github.com/request/request#requestoptions-callback) (including [certificates](https://github.com/request/request#tlsssl-protocol) for tls/ssl https)

###  Docker [images](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21/#2-2-images)

In order to create a docker image we'll need a tarball containing at least a dockerfile at it's root. Dockerizer provides a helpful function `dockerball(dockerfile, entries)` that gives us just what we need. `dockerfile` should be a string; `entries` is optional and can be an array of file/directory paths you wish to include in the archive.

```javascript
// A docker(file tar)ball buffer
let dockerball = yield docker.dockerball(dockerfile, ['/path/to/my/app']);

// Building an image
yield docker.request('/build?t=my-image', { method: 'POST', json: false, headers: { "Content-type": "application/tar" }, body: dockerball }); // since json is true by default (for docker.request), we need to specify it as false here
```

### Docker [containers](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21/#2-1-containers)

```javascript
// Create a container
let config = { Image: 'my-image', HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '3000' }]}}};
let container = yield docker.request(`/containers/create?name=${name}`, { method: 'POST', body: config });
```
We used 'my-image' and bound host port '3000' (must be a string) to port '8080' inside the container, so if an app/server is running on 8080 in there, we'll be able to communicate with it.

```javascript
// Start the container
yield docker.request(`/containers/${container.Id}/start`, { method: 'POST' });

yield new Promise(resolve => setTimeout(resolve, 1000));
```
We set a timeout to make sure the connection is enabled before we use it. This is good enough for development, but it doesn't guarantee anything; in a production environment you need to check the connection before using it.

## Docker on OSX

After installing the docker toolbox and making sure the default docker machine is running `docker-machine start default`, get the machine IP `docker-machine ip default` and use it with the proper certificates:

```javascript
let docker = new Docker({
    uri: "https://192.168.99.100:2376",
    cert: fs.readFileSync("/Users/alex/.docker/machine/certs/cert.pem"),
    key: fs.readFileSync("/Users/alex/.docker/machine/certs/key.pem"),
    ca: fs.readFileSync("/Users/alex/.docker/machine/certs/ca.pem")
});
```
Replace the IP with the one for your docker machine and the user name with yours for the certificates.

## Dockerizer

### constructor(options)
=> Object

#### `options`
Object

Object properties:
- `uri` - The Docker Remote API URI (e.g. the unix socket for docker on linux: `http://unix:/var/run/docker.sock:` - don't forget the trailing ':')

`options` acts as a permanent set of [request](https://github.com/request/request) [options](https://github.com/request/request#requestoptions-callback) for every request sent from the object. This is a good place to set [certificates](https://github.com/request/request#tlsssl-protocol) for https.

Properties set in the constructor options *overwrite* properties set in the request options, so be careful what you set here.

### dockerize (app, options)
=> Promise

Resolves with the container ID.

#### `app`
String | Buffer | Stream

`app` can be a path (String) to a directory/file or code given as a String, Buffer or Stream. Aside from directory, every other case (excepting custom dockerfile projects) will likely require a package json set through `options.package`.

#### `options`
(Optional) Object

Object properties:

- `name` - Container name; `app-${timestamp}` by default; Note: The image name will be `${options.name}-image`;
- `port` - The host port for the container; '3000' by default;
- `dockerfile` - Custom Dockerfile as a string;
- `package` - package.json; Use it for dependencies (e.g. options.package='{ "dependencies": { "express": "*" } }';); For code given as a string\buffer\stream\file path that requires a package.json; Do not set this if app is a path to a directory (create a package.json there instead);
- `start` - Start the container after creation; true by default; Note: Regardless of who starts the container, after issuing the start command you should to wait until it's actually started and functional before you do anything with it;
- `container` - Container configuration; By default, it sets the image to be used and the port bindings in the host configuration; default: ``{ Image: `${container_name}-image`, HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '3000' }]}}}``; For more configuration options, see docker's [create a container](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21/#create-a-container); If you set options.container, you must re-specify the image and port (if you need them);

### request(path, options)
=> Promise

Resolves to the response body by default (can be changed to return the full response).

#### `path`
String

Represents the [Docker Remote API Endpoint](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21/#2-endpoints) to send the request to.

#### `options`
(Optional) Object

Same as [options](https://github.com/request/request#requestoptions-callback) from the [request/request](https://github.com/request/request) package.

- `options.method`  is `GET` by default, same as  `request/request`; other methods need to be specified;
- `options.encoding` is utf8 by default, same as `request/request`;
- `options.json` is true by default; if you don't want the content type to be set to JSON and/or the body automatically parsed, specify it as false; this is different from `request/request` due to the more common usage of json as true throughout this project;
- `options.result` if set to true, `request`'s promise will resolve to the full response as opposed to just the body; this is an extra due to the more common usage of body throughout this project;

### dockerball(dockerfile, entries)
=> Promise

Resolves to a tarball Buffer.

#### `dockerfile`
String

The `Dockerfile` string to include as a file in the tarball.

#### `entries`
(Optional) Array

An array of path strings (files/directories) to include in the tarball (e.g. `'/path/to/my/app'`).

Can also contain Strings, Buffers and Streams, described through [objects](https://github.com/kesarion/simple-archiver#--entries) (e.g. `{ data: buffer, type: 'buffer', name: 'myfile.txt' }`).

## Planned

- Docker management & statistics
