module.exports = Router

var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var debug = require('debug')('wudup:router')
var simlog = require('./simlog')

inherits(Router, EventEmitter)

function Router (channels, id) {
  if (!(this instanceof Router)) return new Router()

  var self = this
  self.id = id
  self.channels = channels

  self.concurrency = 2
  self.maxHops = 20
  self.touched = {}
  self.channelListeners = {}

  self.channels.on('added', onChannelAdded)
  self.channels.on('removed', onChannelRemoved)

  // Add listeners for initial channels
  for (var c of self.channels.toArray()) self._onChannelAdded(c)

  function onChannelAdded (channel) {
    self._onChannelAdded(channel)
  }

  function onChannelRemoved (channel) {
    self._onChannelRemoved(channel)
  }
}

Router.prototype.send = function (id, data) {
  var self = this

  var msg = {
    to: id.toString('hex'),
    from: self.id.toString('hex'),
    path: [],
    nonce: '' + Math.floor(1e15 * Math.random()),
    data: data
  }

  self.touched[msg.nonce] = true

  debugMsg('SEND', self.id, msg)
  simlog('send', self.id, msg)

  self._send(msg)
}

Router.prototype._send = function (msg) {
  var self = this

  if (msg.path.length >= self.maxHops) throw new Error('Max hops exceeded nonce=' + msg.nonce)
  if (self.channels.count() === 0) throw new Error('Not connected to any peers')

  msg.path.push(self.id.toString('hex'))

  var target = new Buffer(msg.to, 'hex')
  var closests = self.channels.closest(target, 20)
    .filter((element) => msg.path.indexOf(element.id.toString('hex')) === -1)
    .filter((_, index) => index < self.concurrency)

  for (var channel of closests) {
    // TODO BUG Sometimes the WS on closest in not in the ready state
    channel.send(msg)
    if (channel.id.toString('hex') === msg.to) break
  }
}

Router.prototype._onMessage = function (msg) {
  var self = this

  if (msg.nonce in self.touched) return
  self.touched[msg.nonce] = true

  msg.to = new Buffer(msg.to, 'hex')
  msg.from = new Buffer(msg.from, 'hex')

  if (msg.to.equals(self.id)) {
    self.emit('message', msg.data, msg.from)
    debugMsg('RECV', self.id, msg)
    simlog('recv', self.id, msg)
  } else {
    self._send(msg)
    debugMsg('RELAY', self.id, msg)
  }
}

Router.prototype._onChannelAdded = function (channel) {
  var self = this

  channel.on('message', listener)
  self.channelListeners[channel.id] = listener

  function listener (msg) {
    self._onMessage(msg)
  }
}

Router.prototype._onChannelRemoved = function (channel) {
  var self = this
  var listener = self.channelListeners[channel.id]
  channel.removeListener('message', listener)
}

function debugMsg (verb, localID, msg) {
  var to = Buffer.isBuffer(msg.to) ? msg.to.toString('hex') : msg.to
  var from = Buffer.isBuffer(msg.from) ? msg.from.toString('hex') : msg.from
  verb = (verb + '     ').substr(0, 5)

  debug('[%s] %s (%s->%s) %s',
        localID.toString('hex', 0, 2),
        verb,
        from.substr(0, 4),
        to.substr(0, 4),
        msg.nonce.substr(0, 4),
        JSON.stringify(msg.data))
}
