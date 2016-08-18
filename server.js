#!/usr/bin/env node

var process = require('process')
var Client = require('./lib/client')

var needsHelp = process.argv.indexOf('--help') !== -1 ||
                process.argv.indexOf('-h') !== -1 ||
                process.argv.length < 3

if (!needsHelp) {
  var opts = {
    port: parseInt(process.argv[2]),
    bootstrap: process.argv.length === 4 ? [ process.argv[3] ] : []
  }

  var c = new Client(opts)

  c.on('peer', function (id) {
    console.error('PEER', id.toString('hex', 0, 2))
  })
} else {
  console.error(`\
    ${process.argv[1]} port [bootstrap_urls...]

    Starts a PeerRelay node and listens for WebSocket connectionso on 'port'

    An optional list of bootstrap urls can be provided as positional arguments.
  `)
}

