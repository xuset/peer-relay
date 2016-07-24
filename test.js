var assert = require('assert')
var Client = require('.')

describe('End to End', function () {
  var clients = []

  function startClient (opts) {
    var c = new Client(opts)
    clients.push(c)
    return c
  }

  this.afterEach(function (done) {
    function destroy () {
      if (clients.length === 0) {
        done()
      } else {
        clients.pop().destroy(destroy)
      }
    }
    destroy()
  })

  it('two peers connect', function (done) {
    var c1 = startClient({ port: 8001, bootstrap: [] })
    var c2 = startClient({ port: 8002, bootstrap: ['ws://localhost:8001'] })
    var count = 0

    c1.on('peer', function (id) {
      assert.ok(id.equals(c2.id))
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })

    c2.on('peer', function (id) {
      assert.ok(id.equals(c1.id))
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })
  })

  it('direct message', function (done) {
    var c1 = startClient({ port: 8001, bootstrap: [] })
    var c2 = startClient({ port: 8002, bootstrap: ['ws://localhost:8001'] })
    var count = 0

    c1.on('peer', function (id) {
      assert.ok(id.equals(c2.id))
      c1.send(id, 'TEST1')
    })

    c2.on('peer', function (id) {
      assert.ok(id.equals(c1.id))
      c2.send(id, 'TEST2')
    })

    c1.on('message', function (msg, id) {
      assert.ok(id.equals(c2.id))
      assert.equal(msg, 'TEST2')
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })

    c2.on('message', function (msg, id) {
      assert.ok(id.equals(c1.id))
      assert.equal(msg, 'TEST1')
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })
  })

  it('relay message', function (done) {
    // c1 <-> c2 <-> c3
    var c2 = startClient({ port: 8002, bootstrap: [] })
    var c1 = startClient({ port: 8001, bootstrap: ['ws://localhost:8002'] })
    var c3 = startClient({ port: 8003, bootstrap: ['ws://localhost:8002'] })

    c1.on('peer', function (id) {
      assert.ok(id.equals(c2.id))
      c1.send(c3.id, 'TEST')
    })

    c3.on('message', function (msg, id) {
      assert.ok(id.equals(c1.id))
      assert.equal(msg, 'TEST')
      done()
    })
  })

  it('clients automatically populate', function (done) {
    // c1 <-> c2 <-> c3
    var c2 = startClient({ port: 8002, bootstrap: [] })
    var c1 = startClient({ port: 8001, bootstrap: ['ws://localhost:8002'] })
    var c3 = startClient({ port: 8003, bootstrap: ['ws://localhost:8002'] })

    var c1PeerEvent = false
    var c3PeerEvent = false

    c1.on('peer', function (id) {
      if (id.equals(c2.id)) {
        // c1.connect(c3.id)
      } else if (id.equals(c3.id)) {
        c1PeerEvent = true
        c1.disconnect(c2.id)
        c1.send(c3.id, 'TEST')
      } else {
        assert.ok(false)
      }
    })

    c3.on('peer', function (id) {
      assert.ok(id.equals(c1.id) || id.equals(c2.id))
      if (id.equals(c1.id)) c3PeerEvent = true
    })

    c3.on('message', function (msg, id) {
      assert.ok(id.equals(c1.id))
      assert.equal(msg, 'TEST')
      assert.ok(c1PeerEvent)
      assert.ok(c3PeerEvent)
      done()
    })
  })
})
