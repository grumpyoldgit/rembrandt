// most important globals

var version = "1.0.0"
var credits = 0 // current credits
var presses = [] // array of presses

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

// Web server
//
// Serves static content as well as results from serial interface.

var express = require('express')
var app = express()

// https://expressjs.com/en/guide/routing.html

app.get('/ping', function (req, res) {
  res.send('pong')
})

app.post('/ping', function (req, res) {
  res.send('pong')
})

app.get('/status', function(req, res) {
  res.send(JSON.stringify({credits: credits, pressed: presses}))
  presses = []
})

app.post('/use_a_credit', function(req, res) {
  res.send(--credits)
})

app.use('/static', express.static('static'))

app.listen(3000, () => console.log('Example app listening on port 3000!'))

// Launch chrome
//
// Launches chrome in kiosk mode to open the app served over /static

// todo


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
 
      http.get('http://127.0.0.1:3000/status', (resp) => {
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

    }).on("error", (err) => {
      console.log("Error: " + err.message);
    })
  })
}

function pressed(button) {
  console.log(button + " pressed")
  if (button == "coin") {
    credits++;
  } else {
    presses.push(button);
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

