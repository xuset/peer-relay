var KBucket = require('k-bucket')
var crypto = require('crypto')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('peer-relay:client')
var Router = require('./router')
var WsConnector = require('./ws')
var WrtcConnector = require('./wrtc')

module.exports = Client

inherits(Client, EventEmitter)
function Client (opts) {
  if (!(this instanceof Client)) return new Client(opts)
  if (!opts) opts = {}

  var self = this

  self.id = crypto.randomBytes(20)
  self.pending = {}
  self.destroyed = false
  self.peers = new KBucket({
    localNodeId: self.id,
    numberOfNodesPerKBucket: 20
  })
  self.peers.on('removed', onRemoved)
  self.canidates = new KBucket({ // TODO expire canidates after period
    localNodeId: self.id,
    numberOfNodesPerKBucket: 20
  })

  self.router = new Router(self.peers, self.id)
  self.router.on('message', onMessage)

  self.wsConnector = new WsConnector(self.id, opts.port)
  self.wsConnector.on('connection', onConnection)

  self.wrtcConnector = new WrtcConnector(self.id, self.router, opts.wrtc)
  self.wrtcConnector.on('connection', onConnection)

  self._debug('Client(%s)', JSON.stringify(opts, ['port', 'bootstrap']))

  for (var uri of (opts.bootstrap || [])) {
    self.wsConnector.connect(uri)
  }

  function onConnection (channel) {
    self._onConnection(channel)
  }

  function onMessage (msg, from) {
    self._onMessage(msg, from)
  }

  function onRemoved (channel) {
    channel.destroy()
  }
}

Client.prototype._onConnection = function (channel) {
  var self = this
  if (self.destroyed) throw new Error('Cannot setup channel when client is destroyed')

  channel.on('close', onClose)
  channel.on('error', onError)

  delete self.pending[channel.id]
  self.canidates.add({ id: channel.id })

  if (self.peers.get(channel.id)) {
    if (channel.id.compare(self.id) >= 0) channel.destroy()
    return
  }

  self.peers.add(channel)

  self.router.send(channel.id, {
    type: 'findPeers',
    data: self.id.toString('hex')
  })

  self.emit('peer', channel.id)

  function onClose () {
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
      data: {
        ws: self.wsConnector.url,
        wrtc: self.wrtcConnector.supported
      }
    })
  }
}

Client.prototype._onHandshakeAnswer = function (msg, from) {
  var self = this
  if (self.peers.get(from)) return
  if (msg.data == null) return

  if (msg.data.wrtc && self.wrtcConnector.supported) self.wrtcConnector.connect(from)
  else if (msg.data.ws) self.wsConnector.connect(msg.data.ws)
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

  self.wsConnector.destroy(cb)
  self.wrtcConnector.destroy()
  var peers = self.peers.toArray()
  for (var i = 0; i < peers.length; i++) {
    peers[i].destroy()
  }
}
