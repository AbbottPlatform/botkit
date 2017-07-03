var Botkit = require(__dirname + '/CoreBot.js');
var request = require('request');
var express = require('express');
var bodyParser = require('body-parser');
var querystring = require('querystring');
var async = require('async');

function GActionsBot(configuration) {

  var ActionsApiAiApp = require('actions-on-google').ApiAiApp;

  // Create a core botkit bot
  var gactions_botkit = Botkit(configuration || {});

  // Set some default configurations unless they've already been set.

  var spawned_bots = [];

  // customize the bot definition, which will be used when new connections
  // spawn!
  gactions_botkit.defineBot(require(__dirname + '/GActions_worker.js'));

  // Middleware to track spawned bots and connect existing RTM bots to incoming webhooks
  gactions_botkit.middleware.spawn.use(function (worker, next) {

    // lets first check and make sure we don't already have a bot
    // for this team! If we already have an RTM connection, copy it
    // into the new bot so it can be used for replies.

    var existing_bot = null;
    if (worker.config.id) {
      for (var b = 0; b < spawned_bots.length; b++) {
        if (spawned_bots[b].config.id) {
          if (spawned_bots[b].config.id == worker.config.id) {
            // WAIT! We already have a bot spawned here.
            // so instead of using the new one, use the exist one.
            existing_bot = spawned_bots[b];
          }
        }
      }
    }

    if (!existing_bot && worker.config.id) {
      spawned_bots.push(worker);
    }
    next();

  });

  // set up a web route for receiving outgoing webhooks and/or commands
  gactions_botkit.createWebhookEndpoints = function (webserver, authenticationTokens) {

    if (authenticationTokens !== undefined && arguments.length > 1 && arguments[1].length) {
      secureWebhookEndpoints.apply(null, arguments);
    }

    gactions_botkit.log(
      '** Serving webhook endpoints for commands and outgoing ' +
      'webhooks at: http://' + gactions_botkit.config.hostname + ':' + gactions_botkit.config.port + '/gactions/receive');
    webserver.post('/gactions/receive', function (req, res) {

      // Now, pass the webhook into be processed
      const assistant = new ActionsApiAiApp({ request: req, response: res });

      assistant.handleRequest(function (app) {
        gactions_botkit.handleWebhookPayload(req, res, app);
      });
    });

    return gactions_botkit;
  };

  gactions_botkit.handleWebhookPayload = function (req, res, gactionsApp) {

    // is this an events api url handshake?
    if (req.body.type === 'url_verification') {
      gactions_botkit.debug('Received url handshake');
      res.json({ challenge: req.body.challenge });
      return;
    }

    var payload = req.body;
    if (payload.payload) {
      payload = JSON.parse(payload.payload);
    }

    if (payload.originalRequest.source === 'google') {
      let bot = gactions_botkit.spawn({
        gactionsApp: gactionsApp
      });
      // Receive messages and trigger events from the Events API
      return handleEventsAPI(payload, bot);
    }
  };

  function handleEventsAPI(payload, bot) {
    var message = payload;

    // let's normalize some of these fields to match the rtm message format
    if (message.originalRequest.source === 'google') {
      message.text = message.originalRequest.data.inputs[0].rawInputs[0].query;
      message.type = 'message';
      message.user = message.originalRequest.data.user.userId;
      message.channel = message.originalRequest.data.user.userId;
      gactions_botkit.receiveMessage(bot, message);
    }
  }

  gactions_botkit.handleGActionsEvents = function () {

    gactions_botkit.log('** Setting up custom handlers for processing messages');
    gactions_botkit.on('message_received', function (bot, message) {
      if (message.type === 'message') {
        gactions_botkit.trigger(message.type, [bot, message]);
      } else {
        // this is a non-message object, so trigger a custom event based on the type
        gactions_botkit.trigger(message.type, [bot, message]);
      }
    });
  };
  
  gactions_botkit.handleGActionsEvents();

  return gactions_botkit;
}

module.exports = GActionsBot;
