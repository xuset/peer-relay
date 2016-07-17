module.exports = Client

var WebSocketServer = require('ws').Server
var WebSocket = require('ws')
var KBucket = require('k-bucket')
var crypto = require('crypto')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('wudup')
var Channel = require('./channel')

inherits(Client, EventEmitter)

function Client (opts) {
  if (!(this instanceof Client)) return new Client(opts)
  if (!opts) opts = {}

  debug('Client(%s)', JSON.stringify(opts))

  var self = this

  self._wss = new WebSocketServer({ port: opts.port })
  self.id = crypto.randomBytes(20)
  self._k = opts.k || 2
  self.peers = new KBucket({
    localNodeId: self.id,
    numberOfNodesPerKBucket: self._k
  })

  self._wss.on('connection', onConnection)

  function onConnection (ws) {
    self._setupChannel(ws)
  }

  for (var uri of opts.bootstrap) {
    self._setupChannel(new WebSocket(uri))
  }
}

Client.prototype._setupChannel = function (ws) {
  var self = this

  var channel = new Channel(self.id, ws)

  channel.on('open', onOpen)
  channel.on('message', onMessage)
  channel.on('close', onClose)
  channel.on('error', onError)

  function onOpen () {
    self.peers.add(channel)
    self.emit('peer', channel.id)
  }

  function onMessage (msg) {
    self._onMessage(msg)
  }

  function onClose () {
    self.peers.remove(channel.id)
  }

  function onError (err) {
    debug('Error', err)
  }
}

Client.prototype.send = function (id, data) {
  var self = this
  var msg = {
    to: id,
    from: self.id,
    data: data
  }
  debug('SEND', JSON.stringify(msg.data))
  self._send(msg)
}

Client.prototype._send = function (msg) {
  var self = this
  var closest = self.peers.closest(msg.to)[0]
  closest.ws.send(JSON.stringify(msg))
}

Client.prototype._onMessage = function (msg) {
  var self = this

  msg.to = new Buffer(msg.to, 'hex')
  msg.from = new Buffer(msg.from, 'hex')

  if (msg.to.equals(self.id)) {
    debug('RECV', JSON.stringify(msg.data))
    self.emit('message', msg.from, msg.data)
  } else {
    self._send(msg)
  }
}

Client.prototype.destroy = function (cb) {
  var self = this
  self._wss.close(cb)
  for (var i = 0; i < self.peers.length; i++) {
    self.peers[i].destroy()
  }
}
