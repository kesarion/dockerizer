# dockerizer
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

> FROM tatsushid/tinycore-node:4.2
> COPY /app /app
> RUN cd /app; npm install
> EXPOSE  8080
> CMD ["node", "/app"]

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

In order to create a docker image you'll need a tarball containing at least a dockerfile at it's root. Dockerizer provides a helpful function `dockerball(dockerfile, entries)` that gives us just what we need. `dockerfile` should be a string; `entries` is optional and can be an array of paths you wish to include in the archive (also buffers, streams and strings - explained in detail later).

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
We set a timeout to make sure the connection is enabled before we use it. This doesn't guarantee anything, in a production environment you need to check the connection before using it, but it's good enough for development.

## Docker on OSX

On Linux, things are pretty straightforward with the unix socket uri. On OSX, you need to install the docker toolbox and make sure the default docker machine is running `docker-machine start default` then get the machine IP `docker-machine ip default` and use it along with the proper certificates:

```javascript
let docker = new Docker({
    uri: "https://192.168.99.100:2376",
    cert: fs.readFileSync("/Users/alex/.docker/machine/certs/cert.pem"),
    key: fs.readFileSync("/Users/alex/.docker/machine/certs/key.pem"),
    ca: fs.readFileSync("/Users/alex/.docker/machine/certs/ca.pem")
});
```
Replace the IP with the one for your docker machine and the user name with yours for the certificates.




## To do

- Documentation details
- Docker management & statistics