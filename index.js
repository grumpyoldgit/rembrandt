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

var config = require('config')
var comport = config.get('Hardware.comport')

// Google drive client
//
// Used by the webserver to store uploaded pictures



// Web server
//
// Serves static content as well as results from serial interface.

const express = require('express')
const fileUpload = require('express-fileupload')
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

  socket.on('photo taken', function(photo) {
    console.log(photo);
  })

  /*
  // create a watchdog timer that pings the client. If a ping isn't returned, kill it and restart

  socket.on('pong', function() {
    this.last = new Date().getTime()
  })

  socket.watchdog = setInterval(function (socket) {
    if (this.last < (new Date().getTime() - 50000)) {
      // kill chrome and restart it..
      console.log("no chrome instance")
      clearInterval(socket.watchdog)
    }
    socket.emit('ping');
  }, 1000)
  */
})

io.on('disconnect', function() {
  console.log('connection lost to frontend')
})


// /static is all the static content for the frontend

app.use('/static', express.static('static'))

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
  comport.name = "/dev/ROBOT"
  MockBinding.createPort(comport.name, { echo: true, record: true })
}

var port = new SerialPort(comport.name)

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

function hexdump(buffer) {
  var h = ""
  for (const value of buffer.values()) {
    h += "\\x" + value.toString(16, 2)
  }
  return h
}

function decode(instream) {
  for (button in buttons) {
    var b = new Buffer.from(buttons[button].data, "utf-8")
    console.log("comparing: " + hexdump(instream) + " with " + hexdump(b))
    if (instream.includes(b)) {
      pressed(button)
    }
  }
}

var instream = new Buffer("")
var okbuffer = new Buffer.from(buttons["ok"].data, "ascii")

function reassemble(incoming) {
  if (comport.debug) {
    console.log("incoming:\n" + incoming.toString('hex'))
  }

  var l = instream.length + incoming.length
  instream = Buffer.concat([instream, incoming], l)

  if (comport.debug) {
    console.log("reassembled instream:\n" + instream.toString('hex'))
  }

  var offset = instream.indexOf(2) // search for a command

  if (offset == -1) {
    console.log("no command in instream")
    return
  }

  console.log("found 2 at offset " + offset.toString())
  console.log("instream.length is: " + instream.length + " okbuffer length is: "+ okbuffer.length)

  if ((instream.length - offset) < okbuffer.length) {
    console.log("not enough data")
    return
  }

  decode(instream)
  instream = new Buffer("")
}

port.on('data', function(incoming) { // receives node Buffer
  reassemble(incoming)
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