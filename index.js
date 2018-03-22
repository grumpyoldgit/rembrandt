// requires needed later

const fs = require('fs')
const imagedatauri = require('image-data-uri')
const pdfkit = require('pdfkit')
const isWin = (process.platform === "win32")
var path = require('path')
if (isWin) {
  var path = path.win32
}
const util = require('util')

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

  this.store = function(filename, photo, x) {
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
  this.pdf = function(filename, x) {
    winston.info("printing photos")
    var pdf = new pdfkit({autoFirstPage: false})

    var stream = fs.createWriteStream(filename)
    pdf.pipe(stream)
    pdf.addPage({
      layout:"portrait", 
      //size:[144, 432], // 2 * 6 inches (72 points per inch)
      size:[288, 432], // 4 * 6 inches (72 points per inch)
      margins: {top: 9, bottom: 9, right: 9, left: 9}
    })

    var pages = [1,2] // 2 pages of 6 x 2 inches. Not actually pages, just layed out like that.

    for (var page in pages) {
      var column_offset = (page * 144) + 9

      function row_offset(row) { return ((row * 105) + 9) }

      for (i in this.paths) {
        winston.info("adding path " + this.paths[i])
        pdf.image(this.paths[i], column_offset, row_offset(i), {
         fit: [126, 378], // 126 is 144 - 2*9, 378 is scaled from that
         align: 'center',
         margins: {top: 10, bottom: 10, right: 0, left: 0}
         //valign: 'center'
        })
      }

      pdf.text(" ")

      pdf.image("print_footer.png", column_offset, row_offset(3.25), { // add a graphical footer
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
          p.pdf(function () {
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

const crypto = require('crypto');

function checksum (str, algorithm, encoding) {
    return crypto
        .createHash(algorithm || 'sha1')
        .update(str, 'utf8')
        .digest(encoding || 'hex')
}

app.get('/pdf', function(req, res) { // you need to supply the correct file hash to download it

  // chroot

  var p = path.resolve('photos/'+req.query.filename)

  winston.info("PDF request for filename " + req.query.filename + " with checksum " + req.query.checksum)

  if (path.relative('photos', p).includes("..")) {
    winston.error("Photo not found")
    return res.status(404).send("Not found")
  }

  // check hash

  var correct_checksum = "";

  fs.readFile(req.query.filename, (err, data) => {
    var correct_checksum = checksum(data) // checksum the data not the filename

    winston.info(util.format("Supplied checksum: %s, calculated checksump: %s", req.query.checksum, correct_checksum))

    if (correct_checksum != req.query.checksum) { // timing
      winston.error("Checksum not correct")
      return res.status(404).send("Not found")
    }

    var stream = fs.createReadStream(req.query.filename); // both file read operations should probably use this, but that's not in the spec for this work

    var filename = "photos.pdf"; 
    filename = encodeURIComponent(filename);
    res.setHeader('Content-disposition', 'inline; filename="' + filename + '"');
    res.setHeader('Content-type', 'application/pdf');
    stream.pipe(res)
  });
})

function mktmp(ext) {
  var t = (new Date().getTime() / 1000) + Math.random()
  return config.get('Storage.location') + path.sep + t + "." + ext
}

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
    connections[socket.id].photos.store(mktmp("png"), photo)
  })

  socket.on('review.print', function() {
    winston.info("Client message from socket.id %s received: review.print", socket.id)

    var filename = mktmp("pdf")

    connections[socket.id].photos.pdf(filename, function () {
      fs.readFile(filename, (err, data) => {
        io.emit('pdf', filename, checksum(data)) // checksum the file data not the filename
      })
    })
  })

  socket.on('disconnect', function() {
    winston.info('Disconnection from socket.id %s', socket.id)
    delete connections[socket.id]
  })
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
  if (button == "fivedollars" || button == "coin") {
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
  },
  "fivedollars": {
    data: "\xc1\xc1\xc1\xc1"
  }
}

function hexdump(buffer) {
  var h = ""
  for (const value of buffer.values()) {
    h += "\\x" + value.toString(16, 2)
  }
  return h
}

var instream = new Buffer("")

function reassemble(incoming) {
  winston.debug("Serial input, incoming: %s", incoming.toString('hex'))

  var l = instream.length + incoming.length
  instream = Buffer.concat([instream, incoming], l)

  winston.debug("Serial input, reassembled instream: %s", instream.toString('hex'))

  // search for known messages

  for (button in buttons) {
    var b = new Buffer.from(buttons[button].data, "ascii")
    winston.debug("Serial input, comparing: %s with %s", hexdump(instream),  hexdump(b))
    if (instream.includes(b)) {
      pressed(button)
      instream = new Buffer("") // reset buffers once message is received
    }
  }
}

port.on('data', function(incoming) { // receives node Buffer
  reassemble(incoming)
})

// Launch Chrome
//
// Start the frontend in chrome.

const chromeLauncher = require('chrome-launcher');

var flags = ['--disable-gpu', '--kiosk', '--kiosk-printing']

if (test.serial) {
  flags = ['--disable-gpu', '--kiosk-printing', '--disable-print-preview', '--disable-background-timer-throttling']
}

chromeLauncher.launch({
  startingUrl: 'http://127.0.0.1:3000/static/photobooth.html',
  chromeFlags: flags
}).then(chrome => {
  winston.info('Chrome debugging port running on %d', chrome.port);
});