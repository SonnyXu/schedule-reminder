const { RTMClient, WebClient } = require('@slack/client');
const dialogflow = require('dialogflow');
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
const express = require ('express');
const bodyParser = require ('body-parser');
var User = require('./models.js').User;
// An access token (from your Slack app or custom integration - usually xoxb)
const token = process.env.SLACK_TOKEN_BOT;
const SCOPES = ['https://www.googleapis.com/auth/calendar'];
const TOKEN_PATH = 'token.json';
// The client is initialized and then started to get an active connection to the platform
const rtm = new RTMClient(token);
const web = new WebClient(token);

var mongoose = require('mongoose')
mongoose.connection.on('connected', function() {
  console.log('Connected to MongoDB!')
})

mongoose.connection.on('error', function(err) {
  console.log(err)
})
mongoose.connect(process.env.MONGODB_URI);

rtm.start();

rtm.on('message', (event) => {
  if (event.user === rtm.activeUserId) return;
  else {
    function authorize(credentials, callback) {
        const oAuth2Client = new google.auth.OAuth2(
          process.env.CLIENT_ID,
          process.env.CLIENT_SECRET,
          process.env.REDIRECT_URL
        );

        User.findOne({userId: event.user}, function (err, user) {
          if (err) return console.log('Error', err);
          if (!user) {
            getAccessToken(oAuth2Client, callback);
            return;
          }
          var parsedToken = JSON.parse(user.token)
          oAuth2Client.setCredentials(parsedToken);
          callback(oAuth2Client);
        });
      }


      function getAccessToken(oAuth2Client, callback) {
        const authUrl = oAuth2Client.generateAuthUrl({
          access_type: 'offline',
          scope: SCOPES,
        });
        rtm.sendMessage("Authorize this app by visiting this url: " + authUrl + "", event.channel);
        const app = express()
        // Google OAuth2 callback
        var code;
        console.log(process.env.REDIRECT_URL)
        app.get("/", (req, res) => {
          console.log(req.query);
          code = req.query.code
          oAuth2Client.getToken(code, (err, token) => {
            if (err) return callback(err);
            console.log("hi", token);
            oAuth2Client.setCredentials(token);
            var newUser = new User({
              userId: event.user,
              token: JSON.stringify(token)
            })
            newUser.save(function(err) {
              if (err) {
                console.log(err);
              } else {
                console.log("saved!")
              }
            })
            callback(oAuth2Client);
          });
          res.send(code);
        })
        app.listen(1337);
      }
      let query = event.text;

      const projectId = process.env.PROJECT_ID; //https://dialogflow.com/docs/agents#settings
      const sessionId = '12345';
      const languageCode = 'en-US';

      // Instantiate a DialogFlow client.
      const sessionClient = new dialogflow.SessionsClient();

      // Define session path
      const sessionPath = sessionClient.sessionPath(projectId, sessionId);

      // The text query request.
      const request = {
        session: sessionPath,
        queryInput: {
          text: {
            text: query,
            languageCode: languageCode,
          },
        },
      };

      // Send request and log result
      sessionClient
      .detectIntent(request)
      .then(responses => {
        console.log('Detected intent');
        const result = responses[0].queryResult;
        console.log(`  Query: ${result.queryText}`);
        console.log(`  Response: ${result.fulfillmentText}`);
        console.log(`  AllRequiredParamsPresent: ${result.allRequiredParamsPresent}`);
        // Send a response back to the user
        rtm.sendMessage(result.fulfillmentText, event.channel)
        .then((res) => {
          // `res` contains information about the posted message
          console.log('Message sent: ', res.ts);
        })
        .catch(console.error);
        if (result.allRequiredParamsPresent) {
          fs.readFile('credentials.json', (err, content) => {
            if (err) {
              rtm.sendMessage('Error loading client secret file', event.channel);
              return;
            }
            function listEvents(auth) {
              const calendar = google.calendar({version: 'v3', auth});
              calendar.events.list({
                calendarId: 'primary',
                timeMin: (new Date()).toISOString(),
                maxResults: 10,
                singleEvents: true,
                orderBy: 'startTime',
              }, (err, res) => {
                if (err) return console.log('The API returned an error: ' + err);
                const events = res.data.items;
                if (events.length) {
                  rtm.sendMessage('Upcoming 10 events:', event.channel);
                  events.map((event, i) => {
                    const start = event.start.dateTime || event.start.date;
                    rtm.sendMessage(`${start} - ${event.summary}`, event.channel);
                  });
                } else {
                  rtm.sendMessage('No upcoming events found.', event.channel);
                }
              });
            }

            function createEvent(auth) {
              const calendar = google.calendar({version: 'v3', auth});
              console.log(result.parameters.fields.Time.structValue.fields);
              var newDateObj = new Date(new Date(result.parameters.fields.Time.structValue.fields.date_time.stringValue).getTime() + parseInt(result.parameters.fields.duration.stringValue)*60000)
              console.log(newDateObj)
              calendar.events.insert({
                calendarId: 'primary', // Go to setting on your calendar to get Id
                'resource': {
                  'summary': result.parameters.fields.subject.stringValue,
                  'start': {
                    'dateTime': result.parameters.fields.Time.structValue.fields.date_time.stringValue,
                    'timeZone': 'America/Los_Angeles'
                  },
                  'end': {
                    'dateTime': newDateObj,
                    'timeZone': 'America/Los_Angeles'
                  }
                }
              }, (err, {data}) => {
                if (err) return console.log('The API returned an error: ' + err);
                console.log(data)
              })
              return;
            }
            // Authorize a client with credentials, then call the Google Calendar API.
            authorize(JSON.parse(content), createEvent);
          });
        }
        if (result.intent) {
          console.log(`  Intent: ${result.intent.displayName}`);
        } else {
          console.log(`  No intent matched.`);
        }
      })
      .catch(err => {
        console.error('ERROR:', err);
      });
    }
  });
