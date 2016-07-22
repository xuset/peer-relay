module.exports = Channel

var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var debug = require('debug')('wudup:channel')

inherits(Channel, EventEmitter)

function Channel (localID, ws) {
  if (!(this instanceof Channel)) return new Channel(localID, ws)

  var self = this

  self.localID = localID
  self.id = undefined
  self.destroyed = false
  self.ws = ws

  ws.on('open', onOpen)
  ws.on('message', onMessage)
  ws.on('close', onClose)
  ws.on('error', onError)

  if (ws.readyState === 1) onOpen() // if already open

  function onOpen () {
    self._onOpen()
  }

  function onMessage (data) {
    self._onMessage(data)
  }

  function onClose () {
    self.destroy()
  }

  function onError (err) {
    self._onError(err)
  }
}

Channel.prototype._onOpen = function () {
  var self = this
  if (self.destroyed) return

  self.ws.send(JSON.stringify(self.localID))
}

Channel.prototype.send = function (data) {
  var self = this
  if (self.destroyed) return
  if (self.ws.readyState !== 1) throw new Error('WebSocket is not ready')

  var str = JSON.stringify(data)
  // self._debug('SEND', data.type, JSON.stringify(data.data))
  self.ws.send(str)
}

Channel.prototype._onMessage = function (data) {
  var self = this
  if (self.destroyed) return

  var json = JSON.parse(data)

  if (self.id == null) {
    self.id = new Buffer(json, 'hex')
    self._debug('OPEN')
    self.emit('open')
  } else {
    // self._debug('RECV', json.type, JSON.stringify(json.data))
    self.emit('message', json)
  }
}

Channel.prototype._onError = function (err) {
  var self = this
  if (self.destroyed) return

  self._debug('ERROR', err)
  self.emit('error', err)
}

Channel.prototype._debug = function () {
  var self = this
  var remote = self.id ? self.id.toString('hex', 0, 2) : '?'
  var prepend = '[' + self.localID.toString('hex', 0, 2) + '->' + remote + ']  '
  arguments[0] = prepend + arguments[0]
  debug.apply(null, arguments)
}

Channel.prototype.destroy = function () {
  var self = this
  if (self.destroyed) return

  self._debug('CLOSE')
  self.destroyed = true
  self.ws.close()
  self.ws = null

  self.emit('close')
}
