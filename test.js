var assert = require('assert')
var Client = require('.')

describe('End to End', function () {

  var clients = [];

  function startClient(opts) {
    var c = new Client(opts)
    clients.push(c)
    return c
  }

  afterEach(function(done) {
    function destroy() {
      if (clients.length === 0) {
        done()
      } else {
        clients.pop().destroy(destroy)
      }
    }
    destroy()
  })

  it('two peers connect', function(done) {
    var c1 = startClient({ port: 8001, bootstrap: [] });
    var c2 = startClient({ port: 8002, bootstrap: ['ws://localhost:8001'] });
    var count = 0

    c1.on('peer', function(id) {
      assert.ok(id.equals(c2.id))
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })

    c2.on('peer', function(id) {
      assert.ok(id.equals(c1.id))
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })
  })

  it('direct message', function(done) {
    var c1 = startClient({ port: 8001, bootstrap: [] });
    var c2 = startClient({ port: 8002, bootstrap: ['ws://localhost:8001'] });
    var count = 0

    c1.on('peer', function(id) {
      assert.ok(id.equals(c2.id))
      c1.send(id, 'TEST1')
    })

    c2.on('peer', function(id) {
      assert.ok(id.equals(c1.id))
      c2.send(id, 'TEST2')
    })

    c1.on('message', function(id, msg) {
      assert.ok(id.equals(c2.id))
      assert.equal(msg, 'TEST2')
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })

    c2.on('message', function(id, msg) {
      assert.ok(id.equals(c1.id))
      assert.equal(msg, 'TEST1')
      assert.ok(count <= 2)
      count++
      if (count === 2) done()
    })
  })

  it('relay message', function(done) {
    // c1 <-> c2 <-> c3
    var c2 = startClient({ port: 8002, bootstrap: [] });
    var c1 = startClient({ port: 8001, bootstrap: ['ws://localhost:8002'] });
    var c3 = startClient({ port: 8003, bootstrap: ['ws://localhost:8002'] });

    c1.on('peer', function(id) {
      assert.ok(id.equals(c2.id))
      c1.send(c3.id, 'TEST')
    })

    c3.on('message', function(id, msg) {
      assert.ok(id.equals(c1.id))
      assert.equal(msg, 'TEST')
      done()
    })
  })

})
