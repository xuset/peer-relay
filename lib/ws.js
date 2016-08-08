var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('peer-relay:ws')
var WebSocket = getWebSocket()

module.exports = WsConnector

inherits(WsConnector, EventEmitter)
function WsConnector (id, port) {
  var self = this

  self.id = id
  self.destroyed = false
  self._wss = null
  self.url = null

  if (port != null) {
    self._wss = new WebSocket.Server({ port: port })
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

  var channel = new WsChannel(self.id, ws)
  channel.on('open', onOpen)
  channel.on('close', onClose)
  channel.on('error', onError)

  function onOpen () {
    channel.removeListener('open', onOpen)
    channel.removeListener('close', onClose)
    channel.removeListener('error', onError)

    if (self.destroyed) {
      channel.destroy()
      return
    }

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

inherits(WsChannel, EventEmitter)
function WsChannel (localID, ws) {
  var self = this

  self.localID = localID
  self.id = undefined
  self.destroyed = false
  self.ws = ws

  ws.onopen = onOpen
  ws.onmessage = onMessage
  ws.onclose = onClose
  ws.onerror = onError

  if (ws.readyState === 1) onOpen() // if already open

  function onOpen () {
    self._onOpen()
  }

  function onMessage (data) {
    self._onMessage(data.data)
  }

  function onClose () {
    self.destroy()
  }

  function onError (err) {
    self._onError(err)
  }
}

WsChannel.prototype._onOpen = function () {
  var self = this
  if (self.destroyed) return

  self.ws.send(JSON.stringify(self.localID))
}

WsChannel.prototype.send = function (data) {
  var self = this
  if (self.destroyed) return
  if (self.ws.readyState === 2) return // readyState === CLOSING
  if (self.ws.readyState !== 1) throw new Error('WebSocket is not ready')

  var str = JSON.stringify(data)
  self.ws.send(str)
}

WsChannel.prototype._onMessage = function (data) {
  var self = this
  if (self.destroyed) return

  var json = JSON.parse(data)

  if (self.id == null) {
    self.id = new Buffer(json, 'hex')
    self._debug('OPEN')
    self.emit('open')
  } else {
    self.emit('message', json)
  }
}

WsChannel.prototype._onError = function (err) {
  var self = this
  if (self.destroyed) return

  self._debug('ERROR', err)
  self.emit('error', err)
}

WsChannel.prototype._debug = function () {
  var self = this
  var remote = self.id ? self.id.toString('hex', 0, 2) : '?'
  var prepend = '[' + self.localID.toString('hex', 0, 2) + '->' + remote + ']  '
  arguments[0] = prepend + arguments[0]
  debug.apply(null, arguments)
}

WsChannel.prototype.destroy = function () {
  var self = this
  if (self.destroyed) return

  self._debug('CLOSE')
  self.destroyed = true
  self.ws.close()
  self.ws = null

  self.emit('close')
}

function getWebSocket () {
  if (typeof window !== 'undefined' && window.WebSocket) return window.WebSocket
  return require('ws')
}
