module.exports = Client

var WebSocketServer = require('ws').Server
var WebSocket = require('ws')
var KBucket = require('k-bucket')
var crypto = require('crypto')
var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('wudup')

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

  self._wss.on('connection', onIncomingWs)

  function onIncomingWs (ws) {
    self._onIncomingWs(ws)
  }

  for (var uri of opts.bootstrap) {
    self._connect(uri)
  }
}

Client.prototype._connect = function (uri) {
  var self = this
  var ws = new WebSocket(uri)

  ws.on('open', onIncomingWs)

  function onIncomingWs () {
    self._onIncomingWs(ws)
  }
}

Client.prototype._onIncomingWs = function (ws, uri) {
  var self = this

  var peer = {
    ws: ws,
    uri: uri,
    id: undefined
  }

  ws.on('message', onMessage)

  function onMessage (msg) {
    self._onMessage(peer, msg)
  }

  self._send(peer, {
    type: 'init',
    from: self.id
  })
}

Client.prototype.send = function (id, data) {
  var self = this
  var closest = self.peers.closest(id)[0]
  var msg = {
    type: 'relay',
    to: id,
    from: self.id,
    data: data
  }
  self._send(closest, msg)
}

Client.prototype._send = function (peer, msg) {
  debug('SEND', JSON.stringify(msg))
  peer.ws.send(JSON.stringify(msg))
}

Client.prototype._onMessage = function (peer, msg) {
  var self = this

  debug('RECV', msg)

  msg = JSON.parse(msg)
  var toID = 'to' in msg ? new Buffer(msg.to, 'hex') : undefined
  var fromID = new Buffer(msg.from, 'hex')
  var forMe = !toID || toID.equals(self.id)

  if (forMe) {
    if (msg.type === 'init') {
      peer.id = fromID
      self.peers.add(peer) // TODO fix bug
      this.emit('peer', fromID)
    } else if (msg.type === 'relay') {
      self.emit('message', fromID, msg.data)
    }
  } else {
    var closest = self.peers.closest(toID)[0]
    self._send(closest, msg)
  }
}

Client.prototype.destroy = function(cb) {
  var self = this

  for (var i = 0; i < self.peers.length; i++) {
    self.peers[i].ws.close()
  }

  self._wss.close(cb)
}
