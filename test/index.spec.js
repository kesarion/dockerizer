"use strict";

// node
var fs = require('fs');

// npm
var expect = require('chai').expect;
var co = require('co');
var request = require('request');

// Project
var Docker = require('..');

var env = process.env.NODE_ENV;

var docker = new Docker(env !== 'test' ? {
    uri: "https://192.168.99.100:2376",
    cert: fs.readFileSync("/Users/alex/.docker/machine/certs/cert.pem"),
    key: fs.readFileSync("/Users/alex/.docker/machine/certs/key.pem"),
    ca: fs.readFileSync("/Users/alex/.docker/machine/certs/ca.pem")
} : { uri: "http://unix:/var/run/docker.sock:"});

const APP_URI = env !== 'test' ? 'http://192.168.99.100' : 'http://localhost';

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
            { type: 'directory', value: Promise.resolve(APP) }
        ];

        for (let input of inputs) {
            it(`should dockerize a ${input.type}`, () => co(function *() {
                yield docker.dockerize(yield input.value, { package: yield input.package });
                let result = yield promisify(request, [`${APP_URI}:3000`]);
                expect(result.body).to.equal('Hello world');
            }));
        }

        //it('should dockerize a string', () => co(function *() {
        //    yield docker.dockerize(yield app, { package: yield package_json });
        //    let result = yield promisify(request, ['http://localhost:3000']);
        //    expect(result.body).to.equal('Hello world');
        //}));


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