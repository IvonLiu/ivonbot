var http = require('http');
var config = require('./config.json');
var fs = require('fs');
var login = require('facebook-chat-api');
var rp = require('request-promise');
var xml2js = require('xml2js');

http.createServer(function(req, res) {
  console.log("ping");
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.end("");
}).listen(process.env.PORT || 5000);

login({
  email: config.username,
  password: config.password
}, function callback(err, api) {

  if (err) return console.error(err);
  api.listen(function callback(err, message) {

		var input = '';
		if (message.participantIDs.length >= 2) {
			if (message.body.slice(0, 9) == '@ivonbot ' && message.body.length > 9) {
				input = message.body.slice(9);
			}
		} else {
			input = message.body;
		}

    if (input) {
			rp('http://www.pandorabots.com/pandora/talk-xml?botid=9c7986ecfe378490&input='+encodeURIComponent(input)).then(function(response) {
				xml2js.parseString(response, function(err, result) {
					var reply = result.result.that[0];
					api.sendMessage({body: reply}, message.threadID);
				});
			}).catch(function(error) {
				console.log(error);
			});
    }

  });
});
