/* global Y, global */
'use strict'

// socket.io requires utf8. This package checks if it is required by requirejs.
// If window.require is set, then it will define itself as a module. This is erratic behavior and
// results in socket.io having a "bad request".
// This is why we undefine global.define (it is set by requirejs) before we require socket.io-client.
var define = global.define
global.define = null
var io = require('socket.io-client')
// redefine global.define
global.define = define

function extend (Y) {
  class Connector extends Y.AbstractConnector {
    constructor (y, options) {
      // ports of another tabs that we will propagate yjs events to
      if (options === undefined) {
        throw new Error('Options must not be undefined!')
      }
      if (options.room == null) {
        throw new Error('You must define a room name!')
      }

      let connectInConstructor = typeof options.autoConnect === 'undefined' || options.autoConnect

      options = Y.utils.copyObject(options)
      options.role = 'slave'
      options.forwardToSyncingClients = options.forwardToSyncingClients || false
      options.preferUntransformed = true
      super(y, options)
      this.options = options
      options.options = Y.utils.copyObject(options.options)
      options.options = options.options || {}
      if(typeof options.options.autoConnect === 'undefined') {
        options.options.autoConnect = options.autoConnect
      }
      options.url = options.url || 'https://yjs.dbis.rwth-aachen.de:5072'
      var socket = options.socket || io(options.url, options.options)
      this.socket = socket
      var self = this

      this._onConnect = () => {
        socket.emit('joinRoom', {
          room: options.room,
          clientId: options.clientId,
          auth: options.auth
        })
        self.userJoined('server', 'master')
      }

      socket.on('connect', this._onConnect)
      if (socket.connected && connectInConstructor) {
        this._onConnect()
      } else if(connectInConstructor) {
        // no need to connect here, because it will be connected automatically on socket creation
        //socket.connect()
      }

      this._onYjsEvent = function (message) {
        if (message.type != null) {
          if (message.type === 'sync done') {
            // userId is set via storage adapter
            //self.setUserId(options.userId)
          }
          if (message.room === options.room) {
            self.receiveMessage('server', message)
          }
        }
      }
      socket.on('yjsEvent', this._onYjsEvent)

      this._onDisconnect = function (peer) {
        Y.AbstractConnector.prototype.disconnect.call(self)
      }
      socket.on('disconnect', this._onDisconnect)
    }
    disconnect () {
      console.log('Disconnect websocket connector')
      this.socket.emit('leaveRoom', this.options.room)
      if (!this.options.socket) {
        this.socket.disconnect()
      }
      super.disconnect()
    }
    destroy () {
      console.info('destroy websocket connector')
      this.disconnect()
      this.socket.off('disconnect', this._onDisconnect)
      this.socket.off('yjsEvent', this._onYjsEvent)
      this.socket.off('connect', this._onConnect)
      if (!this.options.socket) {
        this.socket.destroy()
      }
      this.socket = null
    }
    reconnect () {
      console.log("Reconnect websocket")
      this.socket.connect()
      super.reconnect()
    }
    send (uid, message) {
      console.log("send a message", uid, message)
      message.room = this.options.room
      this.socket.emit('yjsEvent', message)
      super.send(uid, message)
    }
    broadcast (message) {
      console.log("broadcast a message", message)
      message.room = this.options.room
      this.socket.emit('yjsEvent', message)
      super.broadcast(message)
    }
    isDisconnected () {
      return this.socket.disconnected
    }
  }
  Connector.io = io
  Y.extend('websockets-client-webext', Connector)
}

module.exports = extend
if (typeof Y !== 'undefined') {
  extend(Y)
}
