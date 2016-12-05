"use strict";

// node
const fs = require('fs');

// npm
const expect = require('chai').expect;
const co = require('co');
const request = require('request');

// Project
const Docker = require('..');

// Linux & OSX (in comments) testing URI settings
const docker = new Docker({ uri: "http://unix:/var/run/docker.sock:" }/*{
    uri: "https://192.168.99.100:2376",
    cert: fs.readFileSync("/Users/alex/.docker/machine/certs/cert.pem"),
    key: fs.readFileSync("/Users/alex/.docker/machine/certs/key.pem"),
    ca: fs.readFileSync("/Users/alex/.docker/machine/certs/ca.pem")
}*/);

const APP_URI = 'http://localhost' /*'http://192.168.99.100'*/;

const APP = __dirname + '/resources/app';

describe('Docker', function () {
    this.timeout(300000);
    after(() => cleanup());

    describe('dockerize()', function () {
        beforeEach(() => cleanup());

        let app = promisify(fs.readFile, [`${APP}/index.js`, 'utf8']);
        let package_json = promisify(fs.readFile, [`${APP}/package.json`, 'utf8']);

        let inputs = [
            { type: 'string',    value: app, package: package_json },
            { type: 'buffer',    value: promisify(fs.readFile, [`${APP}/index.js`]), package: package_json },
            { type: 'stream',    value: Promise.resolve(fs.createReadStream(`${APP}/index.js`)), package: package_json },
            { type: 'file',      value: Promise.resolve(`${APP}/index.js`), package: package_json },
            { type: 'directory', value: Promise.resolve(APP), package: Promise.resolve() }
        ];

        for (let input of inputs) {
            it(`should dockerize a ${input.type}`, () => co(function *() {
                yield docker.dockerize(yield input.value, { package: yield input.package });
                let result = yield promisify(request, [`${APP_URI}:3000`]);
                expect(result.body).to.equal('Hello world');
            }));
        }

        it('should work with any supported option', () => co(function *() {
            let port = 45678;
            let portExposed = '7070';
            let options = {
                name: 'my-container',
                port: port,
                dockerfile: `FROM tatsushid/tinycore-node:4.2\nCOPY /app /app\nRUN cd /app; npm install\nEXPOSE  ${portExposed}\nCMD ["node", "/app"]`,
                package: yield package_json,
                start: false,
                container: { Image: 'my-container-image', HostConfig: { PortBindings: { '7070/tcp': [{ HostPort: `${port}` }]}}}
            };
            let id = yield docker.dockerize((yield app).replace('8080', portExposed), options);
            expect(yield docker.request('/containers/json')).to.be.empty; // no running containers
            yield docker.request(`/containers/${id}/start`, { method: 'POST' });
            yield new Promise(resolve => setTimeout(resolve, 1000)); // wait a sec
            let result = yield promisify(request, [`${APP_URI}:${port}`]);
            expect(result.body).to.equal('Hello world');
        }));
    });
});

function cleanup () {
    return co(function *() {
        let containers = yield docker.request('/containers/json?all=1');
        for (let container of containers) {
            yield docker.request(`/containers/${container.Id}?force=1`, { method: 'DELETE' });
        }

        let images = yield docker.request('/images/json?all=1');
        for (let image of images) {
            yield docker.request(`/images/${image.Id}?force=1`, { method: 'DELETE' });
        }
    })
}

function promisify (fun, args) {
    return new Promise ((resolve, reject) => {
        // push a callback function to handle err and res
        args.push((err, res) => err ? reject(err) : resolve(res));
        fun.apply(this, args);
    });
}