#!/usr/bin/env node

var spawn = require('child_process').spawn
var statsLite = require('stats-lite')

var stats = {
  peers: {},
  hops: [],
  sent: [],
  received: [],
  removed: 0
}

function simulate (opts) {
  opts.peers = opts.peers || 3
  for (var i = 0; i < opts.peers; i++) {
    var port = 8000 + i
    var bootstrap = i === 0 ? null : 'ws://localhost:8000'
    setTimeout(spawnPeer, i * 500, port, bootstrap)
  }

  setInterval(function () { printStats() }, 2000)
}

function spawnPeer (port, bootstrap) {
  var args = ['start', '-simlog', port]
  if (bootstrap) args.push('ws://localhost:8000')
  console.error('Starting peer port=%s', port)
  var instance = spawn('npm', args, {shell: true, env: process.env})
  attach(instance.stderr)
}

function printStats () {
  function arrayStats (array) {
    return 'avg=' + statsLite.mean(array) + '  stdev=' + statsLite.stdev(array) + '  99percentile=' + statsLite.percentile(array, 0.99)
  }
  console.log('PEER', JSON.stringify(stats.peers, null, 2))
  var peerCount = Object.keys(stats.peers).map(function (e) { return stats.peers[e].length })
  console.log('PEER COUNT', peerCount)
  console.log('Peers - %s', Object.keys(stats.peers).length)
  console.log('    connections per peer - %s', arrayStats(peerCount))
  console.log('    Removed - %s', stats.removed)
  console.log('Messages:')
  console.log('    Sent     - %s', stats.sent.length)
  console.log('    Received - %s', stats.received.length)
  console.log('    Failed   - %s%%', (100 - 100 * stats.received.length / stats.sent.length).toFixed(1))
  console.log('    Hops     - %s', arrayStats(stats.hops))
  console.log('---------')
}

function attach (stream) {
  var identifier = 'SIMLOG'
  var buffer = new Buffer(1024 * 1024)
  var size = 0
  stream.on('data', function (data) {
    data.copy(buffer, size)
    size += data.length

    var lineIndex = buffer.indexOf('\n'.charCodeAt(0))
    while (lineIndex < size && lineIndex !== -1) {
      var line = buffer.slice(0, lineIndex)

      if (line.indexOf(identifier, 0, 'utf8') === 0) {
        var message = JSON.parse(line.toString('utf8', identifier.length))
        if (message.resource.type === 'Buffer') message.resource = new Buffer(message.resource, 'hex')
        onLog(message)
      } else {
        // console.error(line.toString('utf8'))
      }

      buffer.copy(buffer, 0, lineIndex + 1, size)
      size -= lineIndex + 1
      lineIndex = buffer.indexOf('\n'.charCodeAt(0))
    }
  })
}

function onLog (message) {
  // console.log(JSON.stringify(message))
  var map = {
    'init': onLogInit,
    'recv': onLogRecv,
    'send': onLogSend,
    'peer-removed': onLogPeerRemoved,
    'peer-connect': onLogPeerConnect
  }

  var func = map[message.type]
  if (func) {
    func(message)
  } else {
    console.error('Received log message with unknown type', message)
  }
}

function onLogInit (message) {
  stats.peers[message.resource.toString('hex')] = []
}

function onLogSend (message) {
  var from = new Buffer(message.data.from, 'hex')
  if (Buffer.isBuffer(message.resource) && from.equals(message.resource)) {
    stats.sent.push(message.data.nonce)
  }
}

function onLogRecv (message) {
  var to = new Buffer(message.data.to, 'hex')
  if (Buffer.isBuffer(message.resource) && to.equals(message.resource)) {
    stats.received.push(message.data.nonce)
    stats.hops.push(message.data.path.length)
  }
}

function onLogPeerRemoved (message) {
  stats.removed++
}

function onLogPeerConnect (message) {
  stats.peers[message.resource.toString('hex')].push((new Buffer(message.data, 'hex')).toString('hex', 0, 2))
}

if (require.main === module) {
  var opts = {
    peers: parseInt(process.argv[2]) || undefined
  }
  simulate(opts)
}
