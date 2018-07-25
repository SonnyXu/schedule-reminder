const { RTMClient, WebClient } = require('@slack/client');
const dialogflow = require('dialogflow');
const fs = require('fs');
const readline = require('readline');
const {google} = require('googleapis');
import express from 'express'
import bodyParser from 'body-parser'
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
mongoose.connect(process.env.MONGODB_URI)


const app = express()

// Google OAuth2 callback
var code;
console.log(process.env.REDIRECT_URL)
app.get(process.env.REDIRECT_URL, (req, res) => {
  console.log(req.query);
  code = req.query.code
  res.send(req.query.code);
})
app.listen(1337);


rtm.start();

// This argument can be a channel ID, a DM ID, a MPDM ID, or a group ID
// See the "Combining with the WebClient" topic below for an example of how to get this ID
rtm.on('message', (event) => {
  // For structure of `event`, see https://api.slack.com/events/message
  if (event.user === rtm.activeUserId) return;
  else {
    function authorize(credentials, callback) {
      const oAuth2Client = new google.auth.OAuth2(
        process.env.CLIENT_ID,
        process.env.CLIENT_SECRET,
        process.env.REDIRECT_URL
      );

      // Check if we have previously stored a token.
      // fs.readFile(TOKEN_PATH, (err, token) => {
      //   if (err) return getAccessToken(oAuth2Client, callback);
      //   oAuth2Client.setCredentials(JSON.parse(token));
      //   callback(oAuth2Client);
      // });
      User.findOne({userId: event.user}, function (err, user) {
        if (err) return console.log('Error', err);
        if (!user) {
          getAccessToken(oAuth2Client, callback);
          return;
        }
        var parsedToken = JSON.parse(user.token)
        // if (parsedToken.expiry_date <= new Date()) {
        //   oAuth2Client.on('tokens', (tokens) => {
        //     if (tokens.refresh_token) {
        //       // store the refresh_token in my database!
        //       console.log(tokens.refresh_token);
        //     }
        //     console.log(tokens.access_token);
        //   });
        //   oAuth2Client.setCredentials({
        //     refresh_token: `STORED_REFRESH_TOKEN`
        //   });
        //   oAuth2Client.refreshAccessToken()
        // }
        oAuth2Client.setCredentials(parsedToken);
        callback(oAuth2Client);
      });
    }


    function getAccessToken(oAuth2Client, callback) {
      const authUrl = oAuth2Client.generateAuthUrl({
        access_type: 'offline',
        scope: SCOPES,
      });
      //rtm.sendMessage('Authorize this app by visiting this url:', authUrl);
      rtm.sendMessage("Authorize this app by visiting this url: " + authUrl + "", event.channel);
      // const rl = readline.createInterface({
      //   input: process.stdin,
      //   output: process.stdout,
      // });



      // rl.question('Enter the code from that page here: ', (code) => {
      //   rl.close();
        oAuth2Client.getToken(code, (err, token) => {
          if (err) return callback(err);
          oAuth2Client.setCredentials(token);
          // Store the token to disk for later program executions
          // fs.writeFile(TOKEN_PATH, JSON.stringify(token), (err) => {
          //   if (err) console.error(err);
          //   console.log('Token stored to', TOKEN_PATH);
          // });
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
      // });
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
              // console.log(result.parameters.fields);
              console.log(calendar);
              calendar.events.insert({
                calendarId: 'primary', // Go to setting on your calendar to get Id
                'resource': {
                  'summary': "hello",
                  'start': {
                    'dateTime': '2018-07-25T02:10:35.462Z',
                    'timeZone': 'America/Los_Angeles'
                  },
                  'end': {
                    'dateTime': '2018-07-25T06:10:35.462Z',
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
            //authorize(JSON.parse(content), listEvents);
          });
        }

        //web.chat.postMessage(token, event.user, result.fulfillmentText);
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
