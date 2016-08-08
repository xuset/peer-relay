var EventEmitter = require('events').EventEmitter
var inherits = require('util').inherits
var debug = require('debug')('peer-relay:router')

module.exports = Router

inherits(Router, EventEmitter)
function Router (channels, id) {
  var self = this
  self.id = id
  self.concurrency = 2
  self.maxHops = 20
  self._touched = {}
  self._channelListeners = {}
  self._paths = {}
  self._queue = []
  self._channels = channels
  self._channels.on('added', onChannelAdded)
  self._channels.on('removed', onChannelRemoved)

  // Add listeners for initial channels
  for (var c of self._channels.toArray()) self._onChannelAdded(c)

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

  self._touched[msg.nonce] = true

  debugMsg('SEND', self.id, msg)

  self._send(msg)
}

Router.prototype._send = function (msg) {
  var self = this

  if (msg.path.length >= self.maxHops) return // throw new Error('Max hops exceeded nonce=' + msg.nonce)

  if (self._channels.count() === 0) {
    self._queue.push(msg)
  }

  msg.path.push(self.id.toString('hex'))

  var target = new Buffer(msg.to, 'hex')
  var closests = self._channels.closest(target, 20)
    .filter((c) => msg.path.indexOf(c.id.toString('hex')) === -1)
    .filter((_, index) => index < self.concurrency)

  if (msg.to in self._paths) {
    var preferred = self._channels.closest(new Buffer(self._paths[msg.to], 'hex'), 1)[0]
    if (preferred != null && closests.indexOf(preferred) === -1) closests.unshift(preferred)
  }

  for (var channel of closests) {
    // TODO BUG Sometimes the WS on closest in not in the ready state
    channel.send(msg)
    if (channel.id.toString('hex') === msg.to) break
  }
}

Router.prototype._onMessage = function (msg) {
  var self = this

  if (msg.nonce in self._touched) return
  self._touched[msg.nonce] = true

  self._paths[msg.from] = msg.path[msg.path.length - 1]

  msg.to = new Buffer(msg.to, 'hex')
  msg.from = new Buffer(msg.from, 'hex')

  if (msg.to.equals(self.id)) {
    debugMsg('RECV', self.id, msg)
    self.emit('message', msg.data, msg.from)
  } else {
    debugMsg('RELAY', self.id, msg)
    self._send(msg)
  }
}

Router.prototype._onChannelAdded = function (channel) {
  var self = this

  channel.on('message', listener)
  self._channelListeners[channel.id] = listener

  function listener (msg) {
    self._onMessage(msg)
  }

  while (self._queue.length > 0) self._send(self._queue.shift())
}

Router.prototype._onChannelRemoved = function (channel) {
  var self = this
  var listener = self._channelListeners[channel.id]
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
