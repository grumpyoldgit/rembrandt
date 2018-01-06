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

// serial processing

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
    port.binding.emitData(buttons["up"]);
  })
}

function pressed(button) {
  console.log(button + "pressed")
  presses.push(button);
}

var buttons = {
  "up": {
    data:"\x02UPPRS\x03\x01\x9f"
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

function decode_serial(data) {
  if (data.length != 9) {
    throw new UserException("Serial packet with invalid data length received: " + str(data) + " " + str(data.length))
  }
  for (button in buttons.keys()) {
    if (data == button.data) {
      pressed(button)
    }
  }
}

port.on('data', function(data) {
  console.log("Received data: " + data)
  try {
    decode_serial(data)
  } catch(err) {
    return;
  }
})


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
// Launches chrome in kiosk mode and keeps it open.

