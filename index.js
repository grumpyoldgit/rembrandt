// requires needed later

const fs = require('fs')
const path = require('path')
const imagedatauri = require('image-data-uri')
const pdfkit = require('pdfkit')

// load config

const config = require('config')

// configure logging

const winston = require('winston')
winston.configure({
  transports: [
    new (winston.transports.File)({
      filename: config.get("Logging.location"),
      level: config.get("Logging.level"),
      handleExceptions: config.get("Logging.handleExceptions")
    })
  ],
  exitOnError: config.get("Logging.exitOnError")
})

// most important globals

var version = "1.0.0"
var credits = 0 // current credits

var comport = config.get('Hardware.comport')

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

var test = {
  serial: false,
  printing: false
}

if (opt.argv.indexOf("test.serial") > -1) {
  test.serial = true
}

if (opt.argv.indexOf("test.printing") > -1) {
  test.printing = true
}

// Web server
//
// Serves static content as well as results from serial interface.

const express = require('express')
const fileUpload = require('express-fileupload')
var app = express()
var http = require('http').Server(app)
var io = require('socket.io')(http)

// class for handling incoming photos

function Photos() {
  this.paths = []

  this.store = function(photo, x) {
    var t = (new Date().getTime() / 1000) + Math.random()
    var dir = config.get('Storage.location')
    var p = dir + path.sep + t + ".png"
    
    this.paths.push(p)

    if (this.paths.length > 3) {
      this.paths.shift()
    }

    imagedatauri.outputFile(photo, p).then(res => {
      winston.info("Stored image in file %s", res)
      if (!(x===undefined)) {
        x()
      }
    })
  }
  this.print = function(x) {
    winston.info("printing photos")
    var pdf = new pdfkit({autoFirstPage: false})
    var t = (new Date().getTime() / 1000) + Math.random()
    var dir = config.get('Storage.location')

    var stream = fs.createWriteStream(dir + path.sep + t + ".pdf")
    pdf.pipe(stream)

    var pages = [1,2] // 2 pages of 6 x 2 inches

    for (var page in pages) {
      pdf.addPage({
        layout:"portrait", 
        size:[144, 432], // 2 * 6 inches (72 points per inch)
        //size:[288, 432], // 4 * 6 inches (72 points per inch)
        margins: {top: 9, bottom: 9, right: 9, left: 9}
      })

      for (i in this.paths) {
        winston.info("adding path " + this.paths[i])
        pdf.image(this.paths[i], {
         fit: [126, 378], // 126 is 144 - 2*9, 378 is scaled from that
         align: 'center',
         margins: {top: 10, bottom: 10, right: 0, left: 0}
         //valign: 'center'
        })
      }

      pdf.text(" ")

      pdf.image("print_footer.png", { // add a graphical footer
        fit: [126, 378],
        align: 'center',
        margins: {top: 40, bottom: 0, right: 0, left: 0}
      })
    }

    pdf.save()
    pdf.end()
    if (!(x === undefined)) {
      stream.on('finish', x)
    }
  }

  this.clear = function() {
    this.paths = []
  }
}

if (test.printing) {
  var p = new Photos()
  const png = imagedatauri.encodeFromFile("portrait.png").then(res => {
    p.store(res, function() {
      p.store(res, function() {
        p.store(res, function() {
          p.print(function () {
            process.exit()
          })
        })
      })
    })
  })
  return
}

var connections = {} // holds connection-specific data (photos!)

// https://expressjs.com/en/guide/routing.html

app.get('/ping', function (req, res) {
  res.send('pong')
})

app.get('/credits', function (req, res) {
  res.send(credits.toString())
})

io.on('connection', function(socket) {
  winston.info('Connection from frontend received, socket %s', socket.id)

  connections[socket.id] = {socket:socket, photos:new Photos()}

  socket.on('credit used', function() {
    winston.info("Client message from socket.id %s received: credit used", socket.id)
    credits--
    io.emit('credit update', credits)
  })

  socket.on('photo taken', function(photo) {
    winston.info("Client message from socket.id %s received: photo taken", socket.id)
    connections[socket.id].photos.store(photo)
  })

  socket.on('review.print', function() {
    winston.info("Client message from socket.id %s received: review.print", socket.id)
    connections[socket.id].photos.print()
  })

  socket.on('disconnect', function() {
    winston.info('Disconnection from socket.id %s', socket.id)
    delete connections[socket.id]
  })

  /*
  // create a watchdog timer that pings the client. If a ping isn't returned, kill it and restart

  socket.on('pong', function() {
    this.last = new Date().getTime()
  })

  socket.watchdog = setInterval(function (socket) {
    if (this.last < (new Date().getTime() - 50000)) {
      // kill chrome and restart it..
      winston.info("no chrome instance")
      clearInterval(socket.watchdog)
    }
    socket.emit('ping');
  }, 1000)
  */
})


// /static is all the static content for the frontend

app.use('/static', express.static('static'))

http.listen(
  config.get('Webserver.port'), 
  config.get('Webserver.host'), 
  () => winston.info('Express webserver started on host %s port %d', config.get('Webserver.host'), config.get('Webserver.port'))
)

// Serial processing
//
// Reads serial data from the serial port, decoding it so that the data
// is available over the web application started above

var SerialPort = require(test.serial ? "serialport/test" : "serialport")

if (test.serial) {
  MockBinding = SerialPort.Binding
  comport.name = "/dev/ROBOT"
  MockBinding.createPort(comport.name, { echo: true, record: true })
}

var port = new SerialPort(comport.name)

port.on('open', () => {
  winston.info('Serial port opened: %s', port.path)
})

if (test.serial) {
  port.on('open', () => {
    var readline = require('readline')
    readline.emitKeypressEvents(process.stdin)
    process.stdin.setRawMode(true)

    var keymap = {'w':"up", 'a':"left", 's':"down", 'd':"right", 'o':"ok", 'c':"cancel", '$':"coin"}

    console.log("in interactive end-to-end test mode, mock port open. Press " + Object.keys(keymap).toString() + " or q to quit.")

    process.stdin.on('keypress', function (str, key) {
      if (key.sequence in keymap) {
        port.binding.emitData(Buffer.from(buttons[keymap[key.sequence]].data, "ascii"))
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
  winston.info("button pressed: " + button)
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
    var b = new Buffer.from(buttons[button].data, "ascii")
    winston.debug("Serial input, comparing: %s with %s", hexdump(instream),  hexdump(b))
    if (instream.includes(b)) {
      pressed(button)
    }
  }
}

var instream = new Buffer("")
var okbuffer = new Buffer.from(buttons["ok"].data, "ascii")

function reassemble(incoming) {
  winston.debug("Serial input, incoming: %s", incoming.toString('hex'))

  var l = instream.length + incoming.length
  instream = Buffer.concat([instream, incoming], l)

  winston.debug("Serial input, reassembled instream: %s", instream.toString('hex'))

  var offset = instream.indexOf(2) // search for a command

  if (offset == -1) {
    winston.debug("Serial input, no command in instream")
    return
  }

  winston.debug("Serial input, found 2 at offset %d", offset)
  winston.debug("Serial input, instream.length is %d okbuffer length is: %s", instream.length, okbuffer.length)

  if ((instream.length - offset) < okbuffer.length) {
    winston.debug("Serial input, not enough data")
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

if (test.serial) {
  flags = ['--disable-gpu']
}

chromeLauncher.launch({
  startingUrl: 'http://127.0.0.1:3000/static/photobooth.html',
  chromeFlags: flags
}).then(chrome => {
  winston.info('Chrome debugging port running on %d', chrome.port);
});