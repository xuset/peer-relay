'use strict'

var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var Client = require('./client')

module.exports = Socket

var PORT_MAPPINGS = {}

var BIND_STATE_UNBOUND = 0
var BIND_STATE_BINDING = 1
var BIND_STATE_BOUND = 2

inherits(Socket, EventEmitter)
function Socket (opts) {
  if (!(this instanceof Socket)) return new Socket(opts)

  var self = this
  self._port = Math.floor(Math.random() * 9999)
  self._bindState = BIND_STATE_UNBOUND
  self.peer = new Client(opts)
  self.peer.on('message', onMessage)
  self.peer.on('close', onClose)
  self.peer.on('error', onError)

  PORT_MAPPINGS[self._port] = self.peer.id.toString('hex')

  function onMessage (msg) {
    var rinfo = {
      address: msg.address,
      port: msg.port,
      family: 'peer-relay'
    }
    self.emit('message', new Buffer(msg.buffer), rinfo)
  }

  function onClose () {
    self.close()
  }

  function onError (err) {
    self.emit('error', err)
  }
}

Socket.prototype.bind = function (port, cb) {
  var self = this
  if (!self.peer) throw new Error('Not running')
  if (self._bindState !== BIND_STATE_UNBOUND) throw new Error('Socket is already bound')

  delete PORT_MAPPINGS[self._port]
  self._port = port || Math.floor(Math.random() * 9999)
  self._bindState = BIND_STATE_BINDING
  if (cb) self.once('listening', cb)

  if (self.peer.peers.count() > 0) {
    onBind()
  } else {
    self.peer.once('peer', onBind)
  }

  function onBind () {
    PORT_MAPPINGS[self._port] = self.peer.id.toString('hex')
    self._bindState = BIND_STATE_BOUND
    self.emit('listening')
  }
}

// valid combinations
// send(buffer, offset, length, port, address, cb)
// send(buffer, offset, length, port, address)
// send(buffer, offset, length, port)
// send(bufferOrList, port, address, cb)
// send(bufferOrList, port, address)
// send(bufferOrList, port)
Socket.prototype.send = function (buffer, offset, length, port, address, cb) {
  var self = this
  if (!self.peer) throw new Error('Not running')

  var isIP = address.indexOf('.') !== -1
  var isLocal = address === 'localhost' || address === '127.0.0.1'

  var id = isLocal ? PORT_MAPPINGS[port] : address
  var msg = {
    buffer: buffer.slice(offset, length),
    address: isLocal ? address : self.peer.id.toString('hex'),
    port: self._port
  }

  if (id == null || (isIP && !isLocal)) return

  self.peer.send(new Buffer(id, 'hex'), msg)
  if (cb) cb()
}

Socket.prototype.close = function (cb) {
  var self = this
  if (!self.peer) throw new Error('Not running')

  self.peer.destroy()
  self.peer = null

  delete PORT_MAPPINGS[self._port]

  if (cb) self.on('close', cb)
  self.emit('close')
}

Socket.prototype.address = function () {
  var self = this
  if (!self.peer) throw new Error('Not running')

  return {
    address: self.peer.id.toString('hex'),
    port: self._port,
    family: 'peer-relay'
  }
}

Socket.prototype.setBroadcast = function () {
  throw new Error('setBroadcast not implemented')
}

Socket.prototype.setTTL = function () {
  throw new Error('setTTL not implemented')
}

Socket.prototype.setMulticastTTL = function () {
  throw new Error('setMulticastTTL not implemented')
}

Socket.prototype.setMulticastLoopback = function () {
  throw new Error('setMulticastLoopback not implemented')
}

Socket.prototype.addMembership = function () {
  throw new Error('addMembership not implemented')
}

Socket.prototype.dropMembership = function () {
  throw new Error('dropMembership not implemented')
}

Socket.prototype.ref = function () {
  throw new Error('ref not implemented')
}

Socket.prototype.unref = function () {
  throw new Error('unref not implemented')
}
