"use strict";

var app = require('express')();

app.get('/', (req, res) => res.send('Hello world'));

app.listen(8080);
