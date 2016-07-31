var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('wudup:ws')
var WebSocketServer = require('ws').Server
var WebSocket = require('ws')
var Channel = require('./channel')

module.exports = WsConnector

inherits(WsConnector, EventEmitter)
function WsConnector (id, port) {
  var self = this

  self.id = id
  self.destroyed = false
  self._wss = null
  self.url = null

  if (port != null) {
    self._wss = new WebSocketServer({ port: port })
    self._wss.on('connection', onConnection)
    self._wss.on('listening', onListen)
    if (port !== 0) self.url = 'ws://localhost:' + port
  }

  function onConnection (ws) {
    self._onConnection(ws)
  }

  function onListen () {
    if (self.destroyed) return
    self.url = 'ws://localhost:' + self._wss._server.address().port
  }
}

WsConnector.prototype.connect = function (url) {
  var self = this
  self._onConnection(new WebSocket(url))
}

WsConnector.prototype._onConnection = function (ws) {
  var self = this

  if (self.destroyed) {
    ws.close()
    return
  }

  var channel = new Channel(self.id, ws)
  channel.on('open', onOpen)
  channel.on('close', onClose)
  channel.on('error', onError)

  function onOpen () {
    channel.removeListener('open', onOpen)
    channel.removeListener('close', onClose)
    channel.removeListener('error', onError)

    self.emit('connection', channel)
  }

  function onClose () {
    channel.removeListener('open', onOpen)
    channel.removeListener('close', onClose)
    channel.removeListener('error', onError)
  }

  function onError (err) {
    self._debug(err, err.stack)
  }
}

WsConnector.prototype.destroy = function (cb) {
  var self = this
  if (self.destroyed) return

  self.destroyed = true
  if (self._wss) self._wss.close(cb)
  else cb()
  self._wss = null
}

WsConnector.prototype._debug = function () {
  var self = this
  var prepend = '[' + self.id.toString('hex', 0, 2) + ']  '
  arguments[0] = prepend + arguments[0]
  debug.apply(null, arguments)
}
