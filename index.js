"use strict";

const fs = require('fs');
const util = require('util');

const co = require('co');
const request = require('request');
const archive = require('simple-archiver').archive;

const DOCKERFILE =
`FROM tatsushid/tinycore-node:4.2
COPY /app /app
RUN cd /app; npm install
EXPOSE  8080
CMD ["node", "/app"]`;

class Docker
{
    /**
     * Docker constructor
     *
     * @param {Object} options - Request options (for every request; see {@link https://github.com/request/request#requestoptions-callback})
     * @param {String} options.uri - The docker URI; Required
     *
     * Example URIs:
     * http://hostname
     * https://hostname
     * domain, IP or any other hostname
     *
     * http://unix:socket-path:
     * a unix socket (e.g. http://unix:/var/run/docker.sock:)
     *
     * About HTTPS
     * You can set certificates for https, see {@link https://github.com/request/request#tlsssl-protocol}
     *
     * @returns {Docker}
     */
    constructor (options)
    {
        this.options = options || {};
        if (!this.options.uri) throw new Error("options.uri required");
    }

    /**
     * Dockerize an app
     *
     * @param {(String|Buffer|Stream)} app - The app path (String) or code (String|Buffer) or Stream
     *
     * @param {Object} [options] - Options
     * @param {String} [options.name=app-${timestamp}] - Container name; `app-${timestamp}` by default; Note: The image name will be `${options.name}-image`;
     *
     * @param {String} [options.port=3000] - The host port for the container; '3000' by default;
     * Note: The app should run on port 8080 inside the container since that will be bound to this port;
     *
     * @param {String} [options.dockerfile=DOCKERFILE] - Dockerfile as a utf8 string; By default, the DOCKERFILE constant is used
     *
     * @param {String} [options.package] - package.json; Use it for dependencies (e.g. options.package='{ "dependencies": { "express": "*" } }';);
     * For code given as a string\buffer\stream\file path that requires a package.json; Do not set this if app is a path to a directory (create a package.json there);
     *
     * @param {Boolean} [options.start=true] - Start the container after creation; true by default;
     * Note: Regardless of who starts the container, after issuing the start command you need to wait until it's actually started and functional before you do anything with it;
     *
     * @param {Object} [options.container={ Image: `${container_name}-image`, HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: '3000' }]}}}] - Container configuration;
     * By default, it sets the image to be used and the port bindings (set above) in the host configuration;
     * For more configuration options, see {@link https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21/#create-a-container};
     * If you set options.container, you must re-specify the image and port (as shown above);
     *
     * @returns {Promise<String>} - A Promise that returns the container's ID on success
     */
    dockerize (app, options)
    {
        let self = this;
        return co(function *() {
            if (!options) options = {};
            // If no app name is provided, use a timestamp
            let name = options.name || ('app-' + Date.now());

            // If no custom Dockerfile is provided, use default
            let dockerfile = options.dockerfile || DOCKERFILE;

            let entries = [];

            let type = 'stream';
            if (util.isString(app)) {
                type = (yield new Promise(resolve => fs.stat(app, (err, stats) => resolve(err ? false : (stats.isDirectory() ? 'directory' : 'file'))))) || 'string';
            } else if (util.isBuffer(app)) {
                type = 'buffer';
            }

            if (type !== 'directory') {
                entries.push({ data: app, type: type, name: '/app/index.js' });
                entries.push({ data: options.package || '{}', type: 'string', name: '/app/package.json' });
            } else {
                entries.push({ data: app, type: type, name: 'app' });
            }

            // docker(file tar)ball
            let dockerball = yield self.dockerball(dockerfile, entries);

            // Create an image
            yield self.request(`/build?t=${name}-image`, { method: 'POST', json: false, headers: { "Content-type": "application/tar" }, body: dockerball });

            // Create a container
            let config = options.container || { Image: `${name}-image`, HostConfig: { PortBindings: { '8080/tcp': [{ HostPort: (options.port || '3000') + '' }]}}};
            let container = yield self.request(`/containers/create?name=${name}`, { method: 'POST', body: config });

            // Start the container
            if (options.start !== false) {
                yield self.request(`/containers/${container.Id}/start`, { method: 'POST' });
                // timeout to make sure the connection is enabled; this doesn't guarantee anything; in a production environment you need to check the connection before using it
                yield new Promise(resolve => setTimeout(resolve, 1000));
            }

            return container.Id;
        });
    }

    /**
     * Make a request to docker
     *
     * @param {String} path - Path to add to the base docker uri (see {@link https://docs.docker.com/engine/reference/api/docker_remote_api_v1.21})
     * @param {Object} [options] - Request options (see {@link https://github.com/request/request#requestoptions-callback})
     * @param {Boolean} [options.result] - Get the request result instead of the body (e.g. you can then check res.statusCode, headers, etc. as well as res.body)
     *
     * @returns {Promise<Object>} A promise that returns the result of the request on success (you'll probably want result.body for the actual data)
     */
    request (path, options)
    {
        return new Promise((resolve, reject) => {
            // options.method // -> GET by default
            // options.encoding // -> utf8 by default

            if (!options) options = {};
            if (options.json !== false) options.json = true; // when true, the Content-type is set to 'application/json' and the response body is auto-parsed
            // Add pre-set options
            for (let key of Object.keys(this.options)) {
                options[key] = this.options[key];
            }
            options.uri += path;

            request(options, (err, res) => (err ? reject(err) : resolve(options.result ? res : res.body)));
        });
    }

    /**
     * Make a request to docker
     *
     * @param {String} dockerfile - Dockerfile as a string
     * @param {Object[]} [entries] - Entries array (paths, buffers, streams or strings)
     *
     * @returns {Promise<Buffer>}
     */
    dockerball (dockerfile, entries)
    {
        if (!entries) {
            entries = [];
        }

        entries.push({ data: dockerfile, type: 'string', name: 'Dockerfile' });

        return archive(entries, { format: 'tar' });
    }
}

module.exports = Docker;
