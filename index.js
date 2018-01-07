// most important globals

var version = "1.0.0"
var credits = 0 // current credits

var test = false // for mocking serial ports

// parse command-line options first

opt = require('node-getopt').create([
/*
  ['L' , 'long-with-arg=ARG'   , 'long option with argument'],
  [''  , 'color[=COLOR]'       , 'COLOR is optional'],
  ['m' , 'multi-with-arg=ARG+' , 'multiple option with argument'],
*/
  ['h' , 'help'                , 'display this help'],
  ['v' , 'version'             , 'show version']
])              // create Getopt instance
.bindHelp()     // bind option 'help' to default action
.parseSystem(); // parse command line

if (opt.options.version) {
  console.log("rembrandt version " + version);
  process.exit(0);
}

if (opt.argv[0] == "test") {
  test = true
}

// load config

var config = require('config');
var comport = config.get('Hardware.comport');

// Google drive client
//
// Used by the webserver to store uploaded pictures



// Web server
//
// Serves static content as well as results from serial interface.

const express = require('express')
const fileUpload = require('express-fileupload');
var app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)

// https://expressjs.com/en/guide/routing.html

app.get('/ping', function (req, res) {
  res.send('pong')
})

app.get('/credits', function (req, res) {
  res.send(credits.toString())
})

io.on('connection', function(socket) {
  console.log('connection from frontend received')

  socket.on('credit used', function() {
    credits--
    io.emit('credit update', credits)
  })
})

io.on('disconnect', function() {
  console.log('connection lost to frontend')
})


// /static is all the static content for the frontend

app.use('/static', express.static('static'))

app.use(fileUpload());

app.post('/upload', function(req, res) {
  if (!req.files)
    return res.sendStatus(400).send('No files were uploaded.')

  if (req.files.length != 4)
    return res.sendStatus(400).send('Four files needed.')
  /* 
  // The name of the input field (i.e. "sampleFile") is used to retrieve the uploaded file
  var pictures = [req.files.picture1, req.files.picture2, req.files.picture3, req.files.picture4]
 
  // Use the mv() method to place the file somewhere on your server
  sampleFile.mv('/somewhere/on/your/server/filename.jpg', function(err) {
    if (err)
      return res.status(500).send(err);
 
    res.send('File uploaded!');
  });
  */
});

http.listen(
  config.get('Webserver.port'), 
  config.get('Webserver.host'), 
  () => console.log('Example app listening on port 3000!')
)

// Serial processing
//
// Reads serial data from the serial port, decoding it so that the data
// is available over the web application started above

var SerialPort = require(test ? "serialport/test" : "serialport")

if (test) {
  MockBinding = SerialPort.Binding
  comport = "/dev/ROBOT"
  MockBinding.createPort(comport, { echo: true, record: true })
}

var port = new SerialPort(comport)

port.on('open', () => {
  console.log('Port opened: ', port.path)
})

if (test) {
  port.on('open', () => {
    var readline = require('readline')
    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)

    var keymap = {'w':"up", 'a':"left", 's':"down", 'd':"right", 'o':"ok", 'c':"cancel", '$':"coin"}

    console.log("in test mode, mock port open. Press " + Object.keys(keymap).toString() + " or q to quit.")

    process.stdin.on('keypress', function (str, key) {
      if (key.sequence in keymap) {
        port.binding.emitData(Buffer.from(buttons[keymap[key.sequence]].data))
      }
      
      if (key.name == 'q') {
        process.exit(0)
      }

      const http = require('http')

      /* 
      http.get('http://127.0.0.1:3000/keystrokes', (resp) => {
        let data = ''
 
        resp.on('data', (chunk) => {
         data += chunk
        })
 
        resp.on('end', () => {
          console.log(data)
          console.log("credits received via HTTP response: " + JSON.parse(data).credits)
          console.log("pressed received via HTTP response: " + JSON.parse(data).pressed)
        })
      })
      */

    }).on("error", (err) => {
      console.log("Error: " + err.message);
    })
  })
}

function pressed(button) {
  console.log("button pressed: " + button)
  if (button == "coin") {
    credits++;
    io.emit('credit update', credits.toString(), {for:'everyone'})
  } else {
    io.emit('button pressed', button, {for:'everyone'})
  }
}

var buttons = {
  "up": {
    data: "\x02UPPRS\x03\x01\x9f"
  },
  "down": {
    data: "\x02DNPRS\x03\x01\x8c"
  },
  "left": {
    data: "\x02LFPRS\x03\x01\x8c"
  },
  "right": {
    data: "\x02RIPRS\x03\x01\x95"
  },
  "ok": {
    data: "\x02OKPRS\x03\x01\x94"
  },
  "cancel": {
    data: "\x02CCPRS\x03\x01\x80"
  },
  "coin": {
    data: "\x02SC\x00\x00\x01\x03\x00\x9c"
  }
}

function decode(incoming) {
  for (button in buttons) {
    if (incoming.includes (buttons[button].data)) {
      pressed(button)
    }
  }
}

port.on('data', function(incoming) { // receives node Buffer
  decode(incoming)
})

// Launch Chrome
//
// Start the frontend in chrome.

const chromeLauncher = require('chrome-launcher');

var flags = ['--disable-gpu', '--kiosk']

if (test) {
  flags = ['--disable-gpu']
}

chromeLauncher.launch({
  startingUrl: 'http://127.0.0.1:3000/static/photobooth.html',
  chromeFlags: flags
}).then(chrome => {
  console.log('Chrome debugging port running on ${chrome.port}');
});