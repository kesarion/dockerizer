# dockerizer
Docker client and programmatic dockerizer

## Install

npm install dockerizer --save

## Usage

```javascript
var co = require("co"); // I recommend using this package with 'co' or async+wait from ES7
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

function promisify (fun, args) {
    return new Promise ((resolve, reject) => {
        args.push((err, res) => err ? reject(err) : resolve(res));
        fun.apply(this, args);
    });
}
```

### As a docker client
You can use docker.request() to issue any [docker](https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21) requests:
```javascript
let containers = yield docker.request("/containers/json?all=1"); // get all (running and stopped) containers; returns the body by default (the containers array here); GET by default
console.log(containers);

let res = yield docker.request(`/containers/${id}/stop`, { method 'POST', result: true }); // you have to specify non-GET methods; here we're requesting the full result instead the body
console.log(res.statusCode, res.body); // we can check any request result properties now
```

docker.request(path, options) supports any [request](https://github.com/request/request) options (including [certificates](https://github.com/request/request#tlsssl-protocol) for tls/ssl https)

## To be done

Full documentation
