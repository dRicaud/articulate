'use strict'
const shortid = require('shortid');
const Crypto = require('crypto');
const { WebSocketClient, Client } = require('@frontend/mattermost');

let self = {
  client: {},
  webSocketClient: {},
  info: {
    "name": "Mattermost",
    "description": "A quick connection to Slack using the client and websocket end points",
    "documentation": "Using mattermost js driver"
  },
  hash: function( message ) {
    var secret = {
      channel: message.channel
    }
    var hash = Crypto.createHmac('sha256', JSON.stringify(secret)).digest('hex');;
  
    return hash
  },
  converse: function(server, channel, message) {
    let sessionId = self.hash(message)
    let options = {
      method: 'POST',
      url: `/agent/${channel.agent}/converse`,
      payload: {
        text: message.text,
        sessionId: sessionId
      }
    }

    server.inject(options, (res) => {

      const agentResponse = JSON.parse(res.payload).textResponse;
      console.log(agentResponse)

      self.respond(agentResponse, channel, message)
    })
  },
  respond: function ( response, channel, message ) {
    if (!self.client[channel.id]) {
      self.client[channel.id] = new Client(channel.botToken);
    }

    self.client[channel.id].chat.postMessage({ channel: message.channel, text: response })
      .then((res) => {
        // `res` contains information about the posted message
        console.log('Message sent: ', res.ts);
      })
      .catch(console.error);
  },
  init: function(server, request, channel) {

    if (request) {
      channel = {
        id: shortid.generate(),
        agent: request.payload.agent,
        service: request.payload.service,
        botToken: request.payload.details.botToken,
        status: 'Created',
        dateCreated: new Date(),
        dateModified: new Date()
      }
    }

    console.log(channel);

    // The client is initialized and then started to get an active connection to the platform
    // https://github.com/mattermost/mattermost-driver-javascript/blob/master/websocket_client.jsx
    self.webSocketClient[channel.id] = new WebSocketClient(channel.botToken);
    self.webSocketClient[channel.id].start();

    self.webSocketClient[channel.id].on('message', (event) => {
      // For structure of `event`, see https://api.slack.com/events/message

      // Skip messages that are from a bot or my own user ID
      if (event.subtype && event.subtype === 'bot_message') {
        return;
      }

      // Only reply to direct mentions or direct messages
      if (event.channel.charAt(0) == 'D' || event.text.includes(self.webSocketClient[channel.id].activeUserId)) {
        console.log('Message Received.', event)
        self.converse(server, channel, event)
      }

    });

    if (request) {
      return channel
    }
  },
  handleGet: function(server, request, channel, reply) {
    const redis = server.app.redis;

    reply('Not Implemented').code(400)
  },
  handlePost: function( server, request, channel, reply ) {
    const redis = server.app.redis;

    reply('Not Implemented').code(400)
  },
  handleDelete: function( server, request, channel, reply ) {
    const redis = server.app.redis;

    self.webSocketClient[channel.id].disconnect();
    redis.hdel('ubiquity', `channel:${request.params.id}`, function( err, res ) {
      if (err) throw err;

      reply(res)
    })
  }
}

module.exports = self;