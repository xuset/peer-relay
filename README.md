# peer-relay

[![Build Status](https://travis-ci.org/xuset/peer-relay.svg?branch=master)](https://travis-ci.org/xuset/peer-relay)
[![npm version](https://badge.fury.io/js/peer-relay.svg)](https://badge.fury.io/js/peer-relay)

peer-relay is a p2p message relay that works in nodejs and in the browser. It supports WebSockets and WebRTC as transports. Sending a small amount of message to a large number of peers isn't easy to do with WebRTC since the time and resource cost of starting a WebRTC connection can be high. Instead of connecting directly to each peer you need to send message to, it can be better to relay that message through the peers you are already connected to; especially if you only need to send just a few messages. Peer-relay takes care of this by relaying messages for you and providing a simple interface for sending and receiving messages.

## API

### `peer = new PeerRelay([opts])`

Creates a new peer that becomes apart of the relay network

The following fields can be specified within `opts`:
 * port - The port for the web socket server to listen on
 * bootstrap - an array of web socket urls to peers already connected to the network
 * wrtc - custom webrtc implementation

`port` can only be specified if the peer is running nodejs since start a WebSocket server is not possible in a browser. Every peer should specify at least on bootstrap peer (unless that peer is the first/only peer in the network)

### `peer.id`

The peer's id. `id` is 160 bit Buffer.

### `peer.connect(id)`

Forms a direct connection with the given peer. `id` is the id of the peer to connect to and must be a Buffer.

### `peer.disconnect(id)`

Disconnect the a currently connected peer with `id`.

### `peer.send(id, data)`

Send `data` to the peer with and id equal to `id`. The peer does not have to be directly connected to because it will be relayed through other peers. This is similiar to UDP in that message delivery or order is not guaranteed.

### `peer.destroy([cb])`

Destroy the peer and free it's resources. An optional callback can be specified and will be called when all the resources are freed.

### `var socket = new PeerRelay.Socket([opts])`

Creates a new [dgram](https://nodejs.org/api/dgram.html) like socket that uses peer-relay to send messages between peers. This allows for peer-relay to be used by programs that expect the dgram interface. This method accepts the same arguments as the PeerRelay constructor. The returned object tries to match the interface provided by dgram's [Socket](https://nodejs.org/api/dgram.html#dgram_class_dgram_socket).

`socket.peer` references the underlying PeerRelay instance.

## Events

### `peer.on('message', function (data, from) {})`

Fired when a message addressed to the peer was received. `from` is the Buffer id of the peer that sent the message.

### `peer.on('peer', function (id) {})`

Fired when a peer has been directly connected to
