var config = require('config');
var SerialPort = require('serialport');

var comport = config.get('Hardware.comport');

var port = new SerialPort(comport, function(err) {
	if (err) {
		return console.log("Error: ", err.message);
	}
});


function decode_serial(data) {
	if (data[])
}

port.on('data', function(data) {
	console.log(data);
});

