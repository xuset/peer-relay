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

  var self = this

  self._wss = new WebSocketServer({ port: opts.port })
  self.uri = 'ws://localhost:' + opts.port
  self.id = crypto.randomBytes(20)
  self.pending = {}
  self.destroyed = false
  self.peers = new KBucket({
    localNodeId: self.id,
    numberOfNodesPerKBucket: 2
  })
  self.canidates = new KBucket({ // TODO expire canidates after period
    localNodeId: self.id,
    numberOfNodesPerKBucket: 20
  })

  self._debug('Client(%s)', JSON.stringify(opts))

  for (var uri of opts.bootstrap) {
    self._setupChannel(new WebSocket(uri))
  }

  self._wss.on('connection', onConnection)

  function onConnection (ws) {
    if (self.destroyed) ws.close()
    else self._setupChannel(ws)
  }
}

Client.prototype._setupChannel = function (ws) {
  var self = this
  if (self.destroyed) throw new Error('Cannot setup channel when client is destroyed')

  var channel = new Channel(self.id, ws)

  channel.on('open', onOpen)
  channel.on('message', onMessage)
  channel.on('close', onClose)
  channel.on('error', onError)

  function onOpen () {
    delete self.pending[channel.id]
    self.canidates.add({ id: channel.id })

    if (self.peers.get(channel.id)) {
      if (channel.id.compare(self.id) >= 0) channel.destroy()
      return
    }

    self.peers.add(channel)

    channel.send({
      type: 'findPeers',
      to: channel.id,
      from: self.id,
      data: self.id
    })
    self.emit('peer', channel.id)
  }

  function onMessage (msg) {
    self._onMessage(msg)
  }

  function onClose () {
    if (!channel.id) return
    delete self.pending[channel.id]
    self.canidates.remove(channel.id)
    self.peers.remove(channel.id)
  }

  function onError (err) {
    self._debug('Error', err)
  }

  return channel
}

Client.prototype.connect = function (id) {
  var self = this
  if (self.destroyed) return
  if (id in self.pending) return
  if (self.peers.get(id)) return
  if (id.equals(self.id)) return

  self.pending[id] = true

  self._debug('Connecting to id=%s', id.toString('hex', 0, 2))

  self._send({
    type: 'handshake-offer',
    to: id,
    from: self.id
  })
}

Client.prototype.send = function (id, data) {
  var self = this
  if (self.destroyed) return

  var msg = {
    type: 'user',
    to: id,
    from: self.id,
    data: data
  }
  self._debug('SEND', msg.to.toString('hex', 0, 2), JSON.stringify(msg.data))
  self._send(msg)
}

Client.prototype._send = function (msg) {
  var self = this
  if (self.destroyed) return

  var closest = self.peers.closest(msg.to)[0]
  if (closest != null) {
    closest.send(msg)
  } else {
    self._debug('ERROR', 'Failed to send message, not connected to any peers', msg)
  }
}

Client.prototype._onMessage = function (msg) {
  var self = this
  if (self.destroyed) return

  msg.to = new Buffer(msg.to, 'hex')
  msg.from = new Buffer(msg.from, 'hex')

  if (msg.to.equals(self.id)) {
    if (msg.type === 'user') {
      self._debug('RECV', msg.from.toString('hex', 0, 2), JSON.stringify(msg.data))
      self.emit('message', msg.data, msg.from)
    } else if (msg.type === 'findPeers') {
      self._onFindPeers(msg)
    } else if (msg.type === 'foundPeers') {
      self._onFoundPeers(msg)
    } else if (msg.type === 'handshake-offer') {
      self._onHandshakeOffer(msg)
    } else if (msg.type === 'handshake-answer') {
      self._onHandshakeAnswer(msg)
    } else {
      self._debug('Received message with unknown type "%s"', msg.type, msg)
    }
  } else {
    self._send(msg)
  }
}

Client.prototype._onFindPeers = function (msg) {
  var self = this
  var target = new Buffer(msg.data, 'hex')
  var closest = self.canidates.closest(target, 20)
  self._send({
    type: 'foundPeers',
    to: msg.from,
    from: self.id,
    data: closest
  })
}

Client.prototype._onFoundPeers = function (msg) {
  var self = this
  for (var canidate of msg.data) {
    canidate.id = new Buffer(canidate.id, 'hex')
    self.canidates.add(canidate)
  }
  self._populate()
}

Client.prototype._onHandshakeOffer = function (msg) {
  var self = this
  self._send({
    type: 'handshake-answer',
    to: msg.from,
    from: self.id,
    data: self.uri
  })
}

Client.prototype._onHandshakeAnswer = function (msg) {
  var self = this
  self._setupChannel(new WebSocket(msg.data))
}

Client.prototype._populate = function () {
  var self = this
  var optimal = 15
  var closest = self.canidates.closest(self.id, optimal)
  for (var i = 0; i < closest.length && self.peers.count() + Object.keys(self.pending).length < optimal; i++) {
    if (self.peers.get(closest[i].id)) continue
    self.connect(closest[i].id)
  }
}

Client.prototype._debug = function () {
  var self = this
  var prepend = '[' + self.id.toString('hex', 0, 2) + ']  '
  arguments[0] = prepend + arguments[0]
  debug.apply(null, arguments)
}

Client.prototype.destroy = function (cb) {
  var self = this
  if (self.destroyed) return
  self.destroyed = true

  self._wss.close(cb)
  var peers = self.peers.toArray()
  for (var i = 0; i < peers.length; i++) {
    peers[i].destroy()
  }
}
