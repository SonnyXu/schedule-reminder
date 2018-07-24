const { RTMClient, WebClient } = require('@slack/client');
const dialogflow = require('dialogflow');

// An access token (from your Slack app or custom integration - usually xoxb)
const token = process.env.SLACK_TOKEN_BOT;

// The client is initialized and then started to get an active connection to the platform
const rtm = new RTMClient(token);
const web = new WebClient(token);
rtm.start();

// This argument can be a channel ID, a DM ID, a MPDM ID, or a group ID
// See the "Combining with the WebClient" topic below for an example of how to get this ID
rtm.on('message', (event) => {
  // For structure of `event`, see https://api.slack.com/events/message
  console.log(event);
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
      rtm.sendMessage(result.fulfillmentText, event.channel)
      .then((res) => {
        // `res` contains information about the posted message
        console.log('Message sent: ', res.ts);
      })
      .catch(console.error);
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
});
