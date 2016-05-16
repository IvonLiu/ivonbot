var http = require('http');
var fs = require('fs');
var mjAPI = require("./node_modules/mathjax-node/lib/mj-single");
var login = require('facebook-chat-api');
var rp = require('request-promise');
var xml2js = require('xml2js');
var chess = require('./garbochess.js');

var fblogin = process.env.fblogin || require('./config.json').fblogin;
var password = process.env.password || require('./config.json').password;
var god = process.env.god || require('./config.json').god;

var enabled = true;

http.createServer(function(req, res) {
  console.log("ping");
  res.writeHead(200, {
    'Content-Type': 'text/plain'
  });
  res.end("");
}).listen(process.env.PORT || 5000);

setInterval(function() {
	rp('http://www.facebook.com/').then(function(response) {
		console.log('pinging Facebook');
	});
}, 300000);

login({
  email: fblogin,
  password: password
}, function callback(err, api) {

  if (err) return console.error(err);

  api.listen(function callback(err, message) {

    if (err) return console.error(err);
    if (!message) return console.log('Message is undefined');
    if (!message.body) return console.log('Message body is undefined');

    console.log(message.senderID + ": " + message.body);

    if (enabled && message.attachments.length > 0 && message.attachments[0] && message.attachments[0].image && message.attachments[0].image.includes('https://www.facebook.com/messaging/chessboard/?fen=') && message.body && message.body.includes('Ivonbot to move')) {
      chessRequest(api, message);
    } else {
      var input = '';
      if (message.isGroup) {
        if (message.body.slice(0, 9).toLowerCase() == '@ivonbot ' && message.body.length > 9) {
          input = message.body.slice(9);
        }
      } else {
        input = message.body;
      }

      if (input) {

        console.log('Received message: ' + input);
        if (input.length > 250) {
          input = input.slice(0, 250);
          console.log('Shortening input to: ' + input);
        }

        if (message.senderID == god && input.slice(0, 6) == '--aws ' && input.length > 6) {
          awsRequest(api, message, input.slice(6));
        } else if (enabled && input.slice(0, 7) == '--echo ' && input.length > 7) {
          echoRequest(api, message, input.slice(7));
        } else if (enabled && input.slice(0, 10) == '--inverse ' && input.length > 10) {
          inverseRequest(api, message, input.slice(10));
        } else if (enabled && input.slice(0, 6) == '--det ' && input.length > 6) {
          determinantRequest(api, message, input.slice(6));
        } else if (enabled && input.slice(0, 12) == '--translate ' && input.length > 12) {
          translateRequest(api, message, input.slice(12));
        } else if (enabled) {
          pandoraRequest(api, message, input);
        }

      }
    }

  });
});

/** Handle different types of requests **/
function chessRequest(api, message) {
  var url = message.attachments[0].image;
  var fen = decodeURIComponent(url.split('=')[1].split('&')[0]);
  if (message.body.includes('(White)')) {
    fen += " w";
  } else if (message.body.includes('(Black)')) {
    fen += " b";
  } else {
    return;
  }
  fen += ' KQkq -';

  chess.resetGame();
  chess.initializeFromFen(fen);
  chess.search(function(bestMove, value, timeTaken, ply) {
    var move = chess.getMoveSAN(bestMove);
    api.sendMessage({
      body: '@fbchess ' + move
    }, message.threadID);
  }, 99, null);
}

function awsRequest(api, message, input) {
  if (process.env.god) {
    if (input == 'start') {
      enabled = true;
    } else if (input == 'stop') {
      enabled = false;
    }
  }
}

function echoRequest(api, message, input) {
  api.sendMessage({
    body: input
  }, message.threadID);
}

function inverseRequest(api, message, input) {
  var matrix = parseMatrix(input);
  if (!matrix) {
    console.log('Matrix cannot be parsed');
    api.sendMessage({
      body: 'This is not a valid matrix'
    }, message.threadID);
    return;
  }
  var inv = inverse(matrix);
  if (!inv) {
    console.log('Matrix has no inverse');
    api.sendMessage({
      body: 'This matrix has no inverse'
    }, message.threadID);
    return;
  }
  sendMatrix(api, message, inv);
}

function determinantRequest(api, message, input) {
  var matrix = parseMatrix(input);
  if (!matrix) {
    console.log('Matrix cannot be parsed');
    api.sendMessage({
      body: 'This is not a valid matrix'
    }, message.threadID);
    return;
  }
  var determinant = det(matrix);
  api.sendMessage({
    body: 'The determinant is ' + determinant
  }, message.threadID);
}

function translateRequest(api, message, input) {
  if (input.slice(0, 16) == '--list-languages') {
    api.sendMessage({
      body: getLanguageList()
    }, message.threadID);
  } else {
    var languages = input.split(' ')[0];
    var phrase = input.slice(languages.length).trim();
    var fromLang = languages.split(':')[0];
    var toLang = languages.split(':')[1];
    console.log('Translating [' + phrase + '] from ' + fromLang + ' to ' + toLang);
    translate(fromLang, toLang, phrase).then(function(result) {
      api.sendMessage({
        body: result
      }, message.threadID);
    });
  }
}

function pandoraRequest(api, message, input) {
  rp('http://www.pandorabots.com/pandora/talk-xml?botid=9c7986ecfe378490&input=' + encodeURIComponent(input) + '&custid=' + message.threadID).then(function(response) {
    xml2js.parseString(response, function(err, result) {
      var reply = result.result.that[0];
      console.log('Replying: ' + reply);
      api.sendMessage({
        body: reply
      }, message.threadID);
    });
  }).catch(function(error) {
    console.log(error);
  });
}
/** End **/

/** LaTeX helpers **/
var results = [];

function isValidLatex(inputString) {
  return (inputString.length !== 1 &&
    inputString.slice(0, 1) === '$' &&
    inputString.slice(-1) === '$');
}

function extractLatex(inputString) {
  var length = inputString.length;
  return inputString.slice(1, length - 1);
}

function populateResults(inputString) {
  var resultArray = inputString.split("");

  var inMiddle = false;

  for (var i = 0; i < resultArray.length; i++) {
    if (resultArray[i] === '$') {

      if (!inMiddle) {
        results.push("");
      }
      inMiddle = !inMiddle;
    } else {
      if (inMiddle) {
        results[results.length - 1] += resultArray[i];
      }
    }
  }
}
/** End **/

/** Matrix helpers **/
function parseMatrix(data) {
  var rows = data.split('|');
  if (rows == 0) {
    console.log('Parse error: matrix cannot have 0 rows');
    return undefined;
  }
  var matrix = [];
  for (var i = 0; i < rows.length; i++) {
    var cols = rows[i].split(',');
    if (cols.length == 0) {
      console.log('Parse error: matrix cannot have 0 columns');
      return undefined;
    }
    if (cols.length != rows.length) {
      console.log('Parse error: matrix must have equal number of rows and columns');
      return undefined;
    }
    var row = [];
    for (var j = 0; j < cols.length; j++) {
      var num = Number(cols[j]);
      if (num || num == 0) {
        row.push(num);
      } else {
        console.log('Parse error: not a number');
        return undefined;
      }
    }
    matrix.push(row);
  }
  if (matrix.length < 2) {
    console.log('Parse error: matrix must be at least 2x2');
    return undefined;
  } else {
    console.log('Parsed matrix: ' + JSON.stringify(matrix));
    return matrix;
  }
}

function det(matrix) {
  if (matrix.length == 2) {
    return matrix[0][0] * matrix[1][1] - matrix[1][0] * matrix[0][1];
  } else {
    var determinant = 0;
    for (var j = 0; j < matrix[0].length; j++) {
      determinant += (matrix[0][j] * cof(matrix, 0, j));
    }
    return determinant;
  }
}

function cof(matrix, i, j) {
  return Math.pow(-1, i + j) * minor(matrix, i, j);
}

function minor(matrix, i, j) {
  var minorMat = [];
  for (var row = 0; row < matrix.length; row++) {
    if (row != i) {
      var rowVector = [];
      for (var col = 0; col < matrix[row].length; col++) {
        if (col != j) {
          rowVector.push(matrix[row][col]);
        }
      }
      minorMat.push(rowVector);
    }
  }
  return det(minorMat);
}

function transpose(matrix) {
  var transpose = [];
  for (var j = 0; j < matrix[0].length; j++) {
    var vector = [];
    for (var i = 0; i < matrix.length; i++) {
      vector.push(matrix[i][j]);
    }
    transpose.push(vector);
  }
  return transpose;
}

function adj(matrix) {
  if (matrix.length == 2) {
    return [
      [matrix[1][1], -matrix[0][1]],
      [-matrix[1][0], matrix[0][0]]
    ];
  } else {
    var cofMat = [];
    for (var i = 0; i < matrix.length; i++) {
      var rowVector = [];
      for (var j = 0; j < matrix.length; j++) {
        rowVector.push(cof(matrix, i, j));
      }
      cofMat.push(rowVector);
    }
    return transpose(cofMat);
  }
}

function inverse(matrix) {
  var determinant = det(matrix);
  if (determinant == 0) {
    return undefined;
  } else {
    var adjugate = adj(matrix);
    return multiply(1 / determinant, adjugate);
  }
}

function multiply(k, matrix) {
  for (var i = 0; i < matrix.length; i++) {
    for (var j = 0; j < matrix.length; j++) {
      matrix[i][j] *= k;
    }
  }
  return matrix;
}

function pad(spaces, str) {
  var pad = '';
  for (var i = 0; i < spaces; i++) {
    pad += ' ';
  }
  if (typeof str === 'undefined') {
    return pad;
  }
  return (pad + str).slice(-pad.length);
}

function formatMatrix(matrix) {
  var str = '$';
  str += '\\begin{bmatrix}\n';
  for (var row = 0; row < matrix.length; row++) {
    var rowStr = '';
    for (var col = 0; col < matrix[row].length; col++) {
      rowStr += matrix[row][col].toFixed(2);
      if (col != matrix[row].length - 1) {
        rowStr += '&';
      }
    }
    if (row != matrix.length - 1) {
      str += (rowStr + '\\\\\n');
    } else {
      str += (rowStr + '\n');
    }
  }
  str += '\\end{bmatrix}';
  str += '$';
  console.log(str);
  return str;
}

function sendMatrix(api, message, matrix) {

  var body = formatMatrix(matrix);

  // Early return if not a valid text string
  if (!isValidLatex(body)) {
    return;
  }
  populateResults(body);

  console.log(results);

  mjAPI.start();
  mjAPI.config({
    MathJax: {
      SVG: {
        font: "TeX"
      }
    },
    extensions: ""
  });

  for (var i = 0; i < results.length; i++) {

    mjAPI.typeset({
      math: results[i],
      format: "inline-TeX", // "inline-TeX", "MathML"
      png: true, //  svg:true,
      dpi: 800,
      ex: 50,
      width: 100
    }, function(data) {
      //console.log(data);
      if (!data.errors) {

        var base64Data = data.png.replace(/^data:image\/png;base64,/, "");
        var filename = 'file' + i + '.png';

        fs.writeFile(filename, base64Data, 'base64', function(err) {
          if (err) {
            throw err;
          } else {
            var msg = {
              attachment: fs.createReadStream(filename)
            };
            console.log('writing image');
            api.sendMessage(msg, message.threadID);
          }
          fs.unlink(filename, function(err) {
            console.log("deleting temp file: " + filename);
          });
        });
      }
    });

  } // end of for loop
  results = [];
}
/** End **/

/** Translation helpers **/
var languages = {
  afrikaans: 'af',
  albanian: 'sq',
  amharic: 'am',
  arabic: 'ar',
  armenian: 'hy',
  azerbaijani: 'az',
  basque: 'eu',
  belarusian: 'be',
  bengali: 'bn',
  bosnian: 'bs',
  bulgarian: 'bg',
  catalan: 'ca',
  cebuano: 'ceb',
  chichewa: 'ny',
  chinese: 'zh-CN',
  corsican: 'co',
  croatian: 'hr',
  czech: 'cs',
  danish: 'da',
  dutch: 'nl',
  english: 'en',
  esperanto: 'eo',
  estonian: 'et',
  filipino: 'tl',
  finnish: 'fi',
  french: 'fr',
  frisian: 'fy',
  galician: 'gl',
  georgian: 'ka',
  german: 'de',
  greek: 'el',
  gujarati: 'gu',
  haitian_creole: 'ht',
  hausa: 'ha',
  hawaiian: 'haw',
  hebrew: 'iw',
  hindi: 'hi',
  hmong: 'hmn',
  hungarian: 'hu',
  icelandic: 'is',
  igbo: 'ig',
  indonesian: 'id',
  irish: 'ga',
  italian: 'it',
  japanese: 'ja',
  javanese: 'jw',
  kannada: 'kn',
  kazakh: 'kk',
  khmer: 'km',
  korean: 'ko',
  kurdish: 'ku',
  kyrgyz: 'ky',
  lao: 'lo',
  latin: 'la',
  latvian: 'lv',
  lithuanian: 'lt',
  luxembourgish: 'lb',
  macedonian: 'mk',
  malagasy: 'mg',
  malay: 'ms',
  malayalam: 'ml',
  maltese: 'mt',
  maori: 'mi',
  marathi: 'mr',
  mongolian: 'mn',
  myanmar: 'my',
  nepali: 'ne',
  norwegian: 'no',
  pashto: 'ps',
  persian: 'fa',
  polish: 'pl',
  portuguese: 'pt',
  punjabi: 'pa',
  romanian: 'ro',
  russian: 'ru',
  samoan: 'sm',
  scots_gaelic: 'gd',
  serbian: 'sr',
  sesotho: 'st',
  shona: 'sn',
  sindhi: 'sd',
  sinhala: 'si',
  slovak: 'sk',
  slovenian: 'sl',
  somali: 'so',
  spanish: 'es',
  sundanese: 'su',
  swahili: 'sw',
  swedish: 'sv',
  tajik: 'tg',
  tamil: 'ta',
  telugu: 'te',
  thai: 'th',
  turkish: 'tr',
  ukrainian: 'uk',
  urdu: 'ur',
  uzbek: 'uz',
  vietnamese: 'vi',
  welsh: 'cy',
  xhosa: 'xh',
  yiddish: 'yi',
  yoruba: 'yo',
  zulu: 'zu'
}

function getLanguageList() {
  var s = '';
  for (var key in languages) {
    s += key + '\n';
  }
  return s;
}

function getTranslationLanguage(readable) {
  readable = readable.replace(/ *\([^)]*\) */g, "");
  readable = readable.toLowerCase();
  readable = readable.replace(' ', '_');
  return languages[readable] || 'auto';
}

function translate(fromLang, toLang, phrase) {
  var options = {
    method: 'GET',
    url: 'https://translate.googleapis.com/translate_a/single',
    qs: {
      client: 'gtx',
      sl: getTranslationLanguage(fromLang),
      tl: getTranslationLanguage(toLang),
      dt: 't',
      q: phrase
    }
  };
  return rp(options).then(function(response) {
    return response.match(/"(.*?)"/)[1]
  });
}
