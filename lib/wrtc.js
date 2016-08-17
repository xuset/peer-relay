var inherits = require('util').inherits
var EventEmitter = require('events').EventEmitter
var SimplePeer = require('simple-peer')
var debug = require('debug')('peer-relay:wrtc')

module.exports = WrtcConnector

inherits(WrtcConnector, EventEmitter)
function WrtcConnector (id, router, wrtc) {
  var self = this

  self.id = id
  self.destroyed = false
  self.supported = wrtc != null || SimplePeer.WEBRTC_SUPPORT
  self._wrtc = wrtc
  self._pending = {}
  self._router = router
  self._router.on('message', onMessage)

  function onMessage (msg, from) {
    if (msg.type === 'signal') self._onSignal(msg.data, from)
  }
}

WrtcConnector.prototype.connect = function (remoteID) {
  var self = this
  if (self.destroyed) return
  self._setupSimplePeer(remoteID)
}

WrtcConnector.prototype._onSignal = function (signal, from) {
  var self = this
  if (self.destroyed) return
  var sp = self._pending[from]
  if (sp != null) {
    sp.signal(signal)
  } else {
    self._setupSimplePeer(from, signal)
  }
}

WrtcConnector.prototype._setupSimplePeer = function (remoteID, offer) {
  var self = this
  var sp = new SimplePeer({
    initiator: offer == null,
    trickle: true,
    wrtc: self._wrtc
  })

  sp.on('signal', onSignal)
  sp.on('connect', onConnect)
  sp.on('close', onClose)
  sp.on('error', onError)

  if (offer != null) sp.signal(offer)

  self._pending[remoteID] = sp

  function onSignal (signal) {
    self._debug('SIGNAL', signal)
    self._router.send(remoteID, {
      type: 'signal',
      data: signal
    })
  }

  function onConnect () {
    self._debug('CONNECT')
    delete self._pending[remoteID]
    sp.removeListener('signal', onSignal)
    sp.removeListener('connect', onConnect)
    sp.removeListener('close', onClose)
    sp.removeListener('error', onError)
    self.emit('connection', new WrtcChannel(sp, remoteID))
  }

  function onClose () {
    self._debug('CLOSE')
    delete self._pending[remoteID]
    sp.removeListener('signal', onSignal)
    sp.removeListener('connect', onConnect)
    sp.removeListener('close', onClose)
    sp.removeListener('error', onError)
  }

  function onError (err) {
    self._debug('ERROR', err)
  }
}

WrtcConnector.prototype.destroy = function () {
  var self = this
  if (self.destroyed) return

  self.destroyed = true

  for (var id in self._pending) self._pending[id].destroy()
}

WrtcConnector.prototype._debug = function () {
  var self = this
  var prepend = '[' + self.id.toString('hex', 0, 2) + ']  '
  arguments[0] = prepend + arguments[0]
  debug.apply(null, arguments)
}

inherits(WrtcChannel, EventEmitter)
function WrtcChannel (sp, id) {
  var self = this

  self.destroyed = false
  self.id = id
  self._sp = sp
  self._sp.on('data', onData)
  self._sp.on('close', onClose)
  self._sp.on('error', onError)

  function onData (data) {
    if (self.destroyed) return
    self.emit('message', JSON.parse(data))
  }

  function onClose () {
    self.destroy()
  }

  function onError (err) {
    if (self.destroyed) return
    self.emit('error', err)
  }
}

WrtcChannel.prototype.send = function (data) {
  var self = this
  if (self.destroyed) return

  self._sp.send(JSON.stringify(data))
}

WrtcChannel.prototype.destroy = function () {
  var self = this
  if (self.destroyed) return

  self.destroyed = true
  self._sp.destroy()
  self._sp = null
}
