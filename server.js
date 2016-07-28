#!/usr/bin/env node

var process = require('process')
var Client = require('./lib/client')

var opts = {
  port: parseInt(process.argv[2]),
  bootstrap: process.argv.length === 4 ? [ process.argv[3] ] : []
}

var c = new Client(opts)

c.on('peer', function (id) {
  console.error('PEER', id.toString('hex', 0, 2))
})
