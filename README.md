# peer-relay

[![Build Status](https://travis-ci.org/xuset/peer-relay.svg?branch=master)](https://travis-ci.org/xuset/peer-relay)
[![npm version](https://badge.fury.io/js/peer-relay.svg)](https://badge.fury.io/js/peer-relay)

peer-relay is a p2p message relay that works in nodejs and in the browser by supporting WebSockets and WebRTC as transports. Every peer-relay peer connects to a network of other peers. When a peer wants to send a message to another, it does not have to connect directly to the target because the message will be relayed through the network of peers. This is benificial in a few cases like sending a few messages to a lot peers. Traditionally, this would require connecting directly to every peer you needed to send a message to, but in the web browser this can be very costly because of WebRTC limitations. Instead, it may be better to relay those messages through peers you are already connected to, and this is the problem that peer-relay solves.

Every peer generates it's own unique and random id that is used to identify itself within the network. To send a message to a peer, all you need to know is the target peer's id. Peer-relay will then take care of the rest by relaying the message through intermediary peers until it reaches it's target.

## How it works

Before a peer can do anything, it first must bootstrap itself onto the network by knowing the WebSocket urls of at least one peer already connected to the network. Whenever a new connection is formed, both peers exchange info about the peers they are already connected to so they can connect to more peers if they need to. When a peer does want to connect to another, which transport used depends on what both peers support. Websockets are straightforward; connect to the WebSocket url. The WebRTC transport is a little different in that the signaling information must be relayed through intermediary peers before the connection can be formed.

Every peer maintains it's own [k-bucket](https://github.com/tristanls/k-bucket) routing table of peers that it is directly connected to. The message routing used by peer-relay is largely inspired by [kademlia](https://pdos.csail.mit.edu/~petar/papers/maymounkov-kademlia-lncs.pdf) which is why k-bucket is used. When a peer wants to send message to another, it looks at it's routing table for the peer whose id is closest to the target's id, and sends the message to the closest peer. When the receiving peer receives the message, it repeats the same process, and eventually the message will reach it's target. The amount of hops it takes for a message to reach it's target is log(n) where n is the number of peers in the network.

## API

### `peer = new PeerRelay([opts])`

Creates a new peer that becomes apart of the relay network

The following fields can be specified within `opts`:
 * port - The port for the web socket server to listen on. If not defined, then a websocket server is not started
 * bootstrap - an array of web socket urls to peers already connected to the network
 * wrtc - custom nodejs webrtc implementation. Check out [electron-webrtc](https://github.com/mappum/electron-webrtc) or [wrtc](https://github.com/js-platform/node-webrtc)

`port` can only be specified if the peer is running nodejs since start a WebSocket server is not possible in a browser. Every peer should specify at least on bootstrap peer (unless that peer is the first/only peer in the network)

### `peer.id`

The peer's id. `id` is 160 bit Buffer. This id is used to identify the peer within the network.

### `peer.connect(id)`

Forms a direct connection with the given peer. `id` is the id of the peer to connect to and must be a Buffer.

Behind the scenes: a message will be relayed to that peer asking it what transports it supports (WebSocket and/or WebRTC). Then the connection will be formed based on this info; if webrtc is chosen then additional signaling info will be relayed before the connection is formed.

### `peer.disconnect(id)`

Disconnect the a currently connected peer with `id`.

### `peer.send(id, data)`

Send `data` to the peer with the `id`. `data` can be anything that is JSON serializable. The peer does not have to be directly connected to because it will be relayed through other peers. Message delivery or order is not guaranteed.

### `peer.destroy([cb])`

Destroy the peer and free it's resources. An optional callback can be specified and will be called when all the resources are freed.

## Events

### `peer.on('message', function (data, from) {})`

Fired when a message addressed to the peer was received. `from` is the Buffer id of the peer that sent the message.

### `peer.on('peer', function (id) {})`

Fired when a peer has been directly connected to

## PeerRelay.Socket

### `var socket = new PeerRelay.Socket([opts])`

Creates a new [dgram](https://nodejs.org/api/dgram.html) like socket that uses peer-relay to send messages between peers instead of UDP. This allows for peer-relay to be used by programs that expect the dgram socket interface. This method accepts the same arguments as the PeerRelay constructor. The returned object tries to match the interface provided by dgram's [Socket](https://nodejs.org/api/dgram.html#dgram_class_dgram_socket).

There are a few differences to this socket than dgram's. Mainly, ip addresses are replaced by peer IDs.

### `socket.send(buffer, offset, length, port, peerRelayID, [cb])`

This relays the given buffer to the peer with `peerRelayID` by calling `peer.send(...)`. The signature for this method is similar to dgram's socket.send except the peer's id is used instead of the ip address. Port is also ignored, but is still required for compatibility reasons.

### `socket.address()`

Returns the peer's id instead of ip address:
```
{
  address: local peer's id
  port: random number or whatever port socket.bind([port]) was given
  family: a string equal to 'peer-relay'
}
```

### `socket.close([cb])`

Destroys the underlying PeerRelay instance and emits the socket's close event

### `socket.bind([port], [cb])`

Doesn't do anything since peer-relay doesn't have the conecept of binding and ports, but this method remains for compatibilty with dgram's socket.

### `socket.peer`

references the underlying PeerRelay instance.

### `socket.on('message', function (buffer, rinfo) {})`

`buffer` is the received message and `rinfo` is the same structure defined by `socket.address()` exept the sender's id is in the address field.

### `socket.on('error', function (err) {})`

If peer-relay experiences an error, it is bubbled up through this event.

### `socket.on('close', function () {})`

Emitted when socket.close is called or when PeerRelay closes. 

### `socket.on('listening', function () {})`

Doesn't serve any purpose other than dgram socket compatility. This event is emitted after `socket.bind()` is called.
