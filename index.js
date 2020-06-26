var Accessory, hap, Service, Characteristic, UUIDGen;

var russound = require('./russound');
var request = require('request');
var rp = require('request-promise');
var exec = require('child_process').exec;

module.exports = function (homebridge) {
  Accessory = homebridge.platformAccessory;
  hap = homebridge.hap;
  Service = hap.Service;
  Characteristic = hap.Characteristic;
  UUIDGen = homebridge.hap.uuid;

  homebridge.registerPlatform('homebridge-russound-rio', 'Russound', russoundPlatform, true);
}

function russoundPlatform(log, config, api) {
  var self = this;

  self.log = log;
  self.config = config || {
    "mca-series": true,
    "ipaddress": "192.168.1.250",
    "controllerConfig": {
      "controllers": [
        {
          "controller": 1,
          "zones": 6,
          "sources": 6
        }
      ]
    }
  };

  if (api) {
    self.api = api;

    if (api.version < 2.1) {
      throw new Error('Unexpected Homebridge API version.');
    }

    self.api.on('didFinishLaunching', self.didFinishLaunching.bind(this));
  }
}

russoundPlatform.prototype = {
  accessories: function (callback) {
    var foundAccessories = [];
    var count = this.devices.length;
    var index;

    for (index = 0; index < count; index++) {
      var russoundPlatform = new russoundPlatform(this.log, this.devices[index]);
      foundAccessories.push(russoundPlatform);
    }

    callback(foundAccessories);
  }
};

russoundPlatform.prototype.configureAccessory = function (accessory) {
  // Won't be invoked.
}

russoundPlatform.prototype.identify = function (primaryService, paired, callback) {
  primaryService.getCharacteristic(Characteristic.ProgrammableSwitchEvent).setValue(0);
  callback();
}

russoundPlatform.prototype.didFinishLaunching = function () {
  var self = this;

  // Are we debugging everything?
  self.debug = self.config.debug === true;

  if (self.config.ipaddress) {
    var configuredAccessories = [];
    var deviceName = self.config.name || 'Russound';


  };
} else {
  self.log('Russound not configured.');
}






