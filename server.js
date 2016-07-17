#!/usr/bin/env node

var process = require('process')
var Client = require('.')
var debug = require('debug')('wudup')

var opts = {
  port: parseInt(process.argv[2]),
  bootstrap: process.argv.length === 4 ? [ process.argv[3] ] : []
}

var c = new Client(opts)

c.on('message', function (msg) {
  debug('MESSAGE', msg)
})

c.on('peer', function (id) {
  debug('PEER', id)
  c.send(id, 'HELLOWORLD')
})
