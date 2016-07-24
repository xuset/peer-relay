module.exports = Client

var WebSocketServer = require('ws').Server
var WebSocket = require('ws')
var KBucket = require('k-bucket')
var crypto = require('crypto')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('wudup')
var Channel = require('./channel')
var Router = require('./router')
var simlog = require('./simlog')

inherits(Client, EventEmitter)

function Client (opts) {
  if (!(this instanceof Client)) return new Client(opts)
  if (!opts) opts = {}

  var self = this

  self._wss = new WebSocketServer({ port: opts.port })
  self.uri = 'ws://localhost:' + opts.port // TODO wrong uri when port=0
  self.id = crypto.randomBytes(20)
  self.pending = {}
  self.destroyed = false
  self.peers = new KBucket({
    localNodeId: self.id,
    numberOfNodesPerKBucket: 20
  })
  self.canidates = new KBucket({ // TODO expire canidates after period
    localNodeId: self.id,
    numberOfNodesPerKBucket: 20
  })
  self.router = new Router(self.peers, self.id)

  self._debug('Client(%s)', JSON.stringify(opts))
  simlog('init', self.id)

  for (var uri of opts.bootstrap) {
    self._setupChannel(new WebSocket(uri))
  }

  self._wss.on('connection', onConnection)
  self.router.on('message', onMessage)
  self.peers.on('removed', onRemoved)

  function onConnection (ws) {
    if (self.destroyed) ws.close()
    else self._setupChannel(ws)
  }

  function onMessage (msg, from) {
    self._onMessage(msg, from)
  }

  function onRemoved (channel) {
    channel.destroy()
    simlog('peer-removed', self.id)
  }
}

Client.prototype._setupChannel = function (ws) {
  var self = this
  if (self.destroyed) throw new Error('Cannot setup channel when client is destroyed')

  var channel = new Channel(self.id, ws)

  channel.on('open', onOpen)
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

    simlog('peer-connect', self.id, channel.id)

    self.router.send(channel.id, {
      type: 'findPeers',
      data: self.id.toString('hex')
    })

    self.emit('peer', channel.id)
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

  self.router.send(id, {
    type: 'handshake-offer'
  })
}

Client.prototype.disconnect = function (id) {
  var self = this
  if (self.destroyed) return
  if (!self.peers.get(id)) return

  self.peers.get(id).destroy()
}

Client.prototype.send = function (id, data) {
  var self = this
  if (self.destroyed) return

  // self._debug('SEND', id.toString('hex', 0, 2), JSON.stringify(data))
  self.router.send(id, {
    type: 'user',
    data: data
  })
}

Client.prototype._onMessage = function (msg, from) {
  var self = this
  if (self.destroyed) return

  if (msg.type === 'user') {
    // self._debug('RECV', from.toString('hex', 0, 2), JSON.stringify(msg.data))
    self.emit('message', msg.data, from)
  } else if (msg.type === 'findPeers') {
    self._onFindPeers(msg, from)
  } else if (msg.type === 'foundPeers') {
    self._onFoundPeers(msg, from)
  } else if (msg.type === 'handshake-offer') {
    self._onHandshakeOffer(msg, from)
  } else if (msg.type === 'handshake-answer') {
    self._onHandshakeAnswer(msg, from)
  } else {
    self._debug('Received message with unknown type "%s"', msg.type, msg)
  }
}

Client.prototype._onFindPeers = function (msg, from) {
  var self = this
  var target = new Buffer(msg.data, 'hex')
  var closest = self.canidates.closest(target, 20)
  self.router.send(from, {
    type: 'foundPeers',
    data: closest.map((e) => e.id.toString('hex'))
  })
}

Client.prototype._onFoundPeers = function (msg) {
  var self = this
  for (var canidate of msg.data) {
    self.canidates.add({
      id: new Buffer(canidate, 'hex')
    })
  }
  self._populate()
}

Client.prototype._onHandshakeOffer = function (msg, from) {
  var self = this
  if (self.peers.get(from)) return

  if (self.pending[from] == null || from.compare(self.id) < 0) {
    self.pending[from] = true
    self.router.send(from, {
      type: 'handshake-answer',
      data: self.uri
    })
  }
}

Client.prototype._onHandshakeAnswer = function (msg, from) {
  var self = this
  if (self.peers.get(from)) return
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
