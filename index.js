const RIO = require('./russound');
let Service, Characteristic, Homebridge, Accessory, UUIDGen, rio;

const PLUGIN_NAME = 'homebridge-russound-rio';
const PLATFORM_NAME = 'Russound';
const PLUGIN_VERSION = '0.0.1';

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  Homebridge = homebridge;
  Accessory = homebridge.platformAccessory;
  UUIDGen = homebridge.hap.uuid;
  homebridge.registerPlatform(PLUGIN_NAME, PLATFORM_NAME, RussoundPlatform);
};

class RussoundPlatform {
  constructor(log, config, api) {
    this.log = log;
    this.config = config || {};
    this.controllers = {};
    this.log.debugEnabled = (this.config.debug === true)
    this.accessories = [];
    if (api) {
      this.api = api;

      if (api.version < 2.1) {
        throw new Error('Unexpected Homebridge API version.');
      }

    }
    /// ////////////////
    // EVENT FUNCTIONS
    /// ////////////////
    const eventDebug = (response) => {
      this.log.debug('eventDebug: %s', response);
    }

    const eventError = (response) => {
      this.log.error('eventError: %s', response);
    }

    const eventConnect = (response) => {
      this.log.debug('eventConnect: %s', response);
    }

    const eventClose = (response) => {
      this.log.debug('eventClose: %s', response);
    }

    if (this.config.controllers === undefined) {
      this.log.error('ERROR: your configuration is incorrect.');
      this.controllers = '';
    }

    rio = new RIO(this.config, this.log);
    rio.on('debug', eventDebug.bind(this));
    rio.on('error', eventError.bind(this));
    rio.on('connect', eventConnect.bind(this));
    rio.on('close', eventClose.bind(this));

    api.on('didFinishLaunching', () => {
      const uuid = api.hap.uuid.generate('SOMETHING UNIQUE');
      createAccessories(this, this.config.controllers);
    })
  }

  configureAccessory(accessory) {
    this.log.info('Loading accessory from cache:', accessory.displayName);

    // add the restored accessory to the accessories cache so we can track if it has already been registered
    this.accessories.push(accessory);
  }
}

const createAccessories = (platform, config) => {
  if (platform, config && rio) {

    rio.connect().then(() => {
      platform.log.info("Connected to Controller");
      config.forEach((controllerConfig) => {
        var controllerName = controllerConfig.name || platform.config.name || 'Russound';

        const { ip, zones, sources, controller } = controllerConfig
        // You must specify at least the IP of the Russound controller.
        if (!ip) {
          platform.log.error('%s: missing required configuration parameters.', controllerName);
          return (new Error("Unable to initialize the Russound plugin: missing configuration parameters."));
        }

        // Initialize our state for this controller. We need to maintain state separately for each controller.
        platform.controllers[ip] = {};
        var cc = platform.controllers[ip];

        var Promises = [];
        Promises.push(rio.getZones());
        Promises.push(rio.getSources());
        Promise.all(Promises).then(values => {
          cc.zones = values[0]
          cc.sources = values[1];
          //for (let i = 0; i < cc.zones.length; i++) {
          for (let i = 0; i < 2; i++) {
            var zone = cc.zones[i];

            var accessories = [];
            const uuid = UUIDGen.generate(controllerName + zone.id + ip);
            const existingAccessory = platform.accessories.find(accessory => accessory && accessory.UUID === uuid);
            if (existingAccessory) {
              // the accessory already exists
              platform.log.info('Restoring existing accessory from cache:', existingAccessory.displayName);

              // if you need to update the accessory.context then you should run `api.updatePlatformAccessories`. eg.:
              existingAccessory.context.device = cc;
              platform.api.updatePlatformAccessories([existingAccessory]);

              // create the accessory handler for the restored accessory
              // this is imported from `platformAccessory.ts`
              const zoneAccessory = new ZoneAccessory(platform, existingAccessory, ip, controllerName, zone, cc.sources, true);
              accessories.push(zoneAccessory);

            } else {
              platform.log.info('Adding new accessory:', `${controllerName}-${zone.name}`);

              // create a new accessory
              const accessory = new platform.api.platformAccessory(`${controllerName}-${zone.name}`, uuid);
              accessory.category = Homebridge.hap.Accessory.Categories.AUDIO_RECEIVER
              // store a copy of the device object in the `accessory.context`
              // the `context` property can be used to store any data about the accessory you may need
              accessory.context.device = cc;

              // create the accessory handler for the newly create accessory
              // this is imported from `platformAccessory.ts`
              const zoneAccessory = new ZoneAccessory(platform, accessory, ip, controllerName, zone, cc.sources);

              accessories.push(zoneAccessory);

              // link the accessory to your platform
              platform.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
            }
            //addAccessory(controllerName, ip, cc.zones[i], cc.sources);
          }
          return accessories;
        }).then((accessories) => {

        }).catch((error) => {
          platform.log.error("Error in configuring this Controller: %s", error);
        });
      });
    }).catch((error) => {
      platform.log.error("Error in connecting to Controller: %s", error);
    });
  }
  else {
    platform.log.warn('No Controllers configured.');
  }


}

class ZoneAccessory {
  #platform = null;
  #log = null;
  #accessory = null;
  #enabledServices = [];
  #reload = null

  #name = null;
  #zoneId = null;
  #ip = null;

  #inputs = null;

  #cmdMap = {};

  #maxVolume = 50;
  #mapVolume100 = true;
  #buttons = {};
  #powerState = false;
  #muteState = false;
  #volumeState = 0;
  #inputState = null;

  constructor(platform, accessory, ip, controllerName, zone, sources, reload) {
    this.#platform = platform;
    this.#log = platform.log;
    this.#accessory = accessory;
    this.#reload = reload

    this.#name = zone.name;
    this.#log.debug('Name %s', this.#name);
    this.#zoneId = zone.id;
    this.#log.debug('Zone %s', this.#zoneId);
    this.#ip = ip;
    this.#log.debug('IP %s', this.#ip);

    this.#inputs = sources;

    this.#cmdMap.power = `power-${this.#zoneId}`;
    this.#cmdMap.volume = `volume-${this.#zoneId}`;
    this.#cmdMap.muting = `muting-${this.#zoneId}`;
    this.#cmdMap.input = `input-${this.#zoneId}`;

    this.#log.debug('maxVolume: %s', this.#maxVolume);
    this.#log.debug('mapVolume100: %s', this.#mapVolume100);
    this.#buttons = {
      //[Characteristic.RemoteKey.REWIND]: 'rew',
      //[Characteristic.RemoteKey.FAST_FORWARD]: 'ff',
      [Characteristic.RemoteKey.NEXT_TRACK]: 'Next',
      [Characteristic.RemoteKey.PREVIOUS_TRACK]: 'Previous',
      [Characteristic.RemoteKey.ARROW_UP]: 'MenuUp', // 4
      [Characteristic.RemoteKey.ARROW_DOWN]: 'MenuDown', // 5
      [Characteristic.RemoteKey.ARROW_LEFT]: 'MenuLeft', // 6
      [Characteristic.RemoteKey.ARROW_RIGHT]: 'MenuRight', // 7
      [Characteristic.RemoteKey.SELECT]: 'Enter', // 8
      [Characteristic.RemoteKey.BACK]: 'Exit', // 9
      [Characteristic.RemoteKey.EXIT]: 'Exit', // 10
      [Characteristic.RemoteKey.PLAY_PAUSE]: 'Play', // 11
      [Characteristic.RemoteKey.INFORMATION]: 'Info' // 15
    };

    this.avrManufacturer = 'Russound';
    this.avrSerial = `0000-${this.#zoneId}-0000`;
    this.model = `${controllerName}-Zone${this.#zoneId}`
    this.#log.debug('avrSerial: %s', this.avrSerial);

    rio.on(this.#cmdMap.power, this.eventPower.bind(this));
    rio.on(this.#cmdMap.volume, this.eventVolume.bind(this));
    rio.on(this.#cmdMap.muting, this.eventMuting.bind(this));
    rio.on(this.#cmdMap.input, this.eventInput.bind(this));

    //rio.watchSystem(true)
    rio.watchZone(this.#zoneId, true)
    //rio.watchSource(2, true)
    this.setUp();
  }

  setUp() {

    // console.log(this.#accessory.getService(Service.Television, 'tvservice'))

    this.createAccessoryInformationService();
    this.zoneService = this.createZoneService();
    this.createZoneSpeakerService(this.zoneService);
    this.#enabledServices.push(...this.addZoneSources(this.zoneService));
    this.#log.debug('Creating Volume Dimmer service linked to Controller for zone %s', this.#name);
    this.createVolumeDimmerService(this.zoneService);
    this.zoneService.setPrimaryService(true);


  }

  // getServices() {
  //   return this.#enabledServices;
  // }

  eventPower(zoneId, value) {
    if (this.#powerState !== (value === 'ON'))
      this.#log.info('Event - Power changed: %s, for : %s', value, zoneId);

    this.#powerState = (value === 'ON');
    this.#log.debug('eventPower - message: %s, for zone: %s, new state %s', value, zoneId, this.#powerState);
    // Communicate status
    if (this.zoneService) {
      this.zoneService.updateCharacteristic(Characteristic.Active, this.#powerState ? Characteristic.Active.ACTIVE : Characteristic.Active.INACTIVE);
    }
    // if (this.volumeDimmerService) {
    //   if (!this.#powerState)
    //     this.currentVolume = this.volumeDimmerService.getCharacteristic(Characteristic.Brightness).value;
    //   this.volumeDimmerService.setCharacteristic(Characteristic.On, this.#powerState ? Characteristic.ON : Characteristic.OFF);
    //   if (this.#powerState)
    //     this.volumeDimmerService.setCharacteristic(Characteristic.Brightness, this.currentVolume);
    // }
    // }
    // if (this.volume_dimmer) {
    // 	this.#muteState =  !(response == 'ON');
    // 	this.dimmer.getCharacteristic(Characteristic.On).updateValue((response == 'on'), null, 'power event m_status');
    // }
  }

  eventMuting(zoneId, value) {
    this.#muteState = value === 'ON';
    this.#log.debug('eventMuting - message: %s, for zone: %s, new m_state %s ', value, zoneId, this.#muteState);
    // Communicate status
    if (this.zoneSpeakerService)
      this.zoneSpeakerService.updateCharacteristic(Characteristic.Mute, this.#muteState);

    this.getMuteState.bind(this);
  }

  eventInput(zoneId, value) {
    if (value) {
      const input = this.#inputs.find(i => i.id === value);

      // Convert to source input code
      /* eslint no-negated-condition: "warn" */
      if (this.#inputState !== value)
        this.#log.info('Event - Input changed: %s, for zone: %s', input.name, zoneId);

      this.#inputState = input.id;

      this.#log.debug('eventInput - message: %s, for zone: %s - new source: %s - input: %s', value, zoneId, this.#inputState, input.name);
      if (this.zoneService)
        this.zoneService.updateCharacteristic(Characteristic.ActiveIdentifier, this.#inputState);
    } else {
      // Then invalid Input chosen
      this.#log.error('eventInput - ERROR - INVALID INPUT, for zone: %s, - Model does not support selected input.', zoneId);
    }

    this.getInputSource.bind(this);
  }

  eventVolume(zoneId, value) {
    //console.log('eventVolume', zoneId, value)
    if (this.#mapVolume100) {
      const volumeMultiplier = this.#maxVolume / 100;
      const newVolume = value / volumeMultiplier;
      this.#volumeState = Math.round(newVolume);
      this.#log.info('eventVolume - message: %s, for zone: %s, new volume %s PERCENT', value, zoneId, this.#volumeState);
    } else {
      this.#volumeState = value;
      this.#log.info('eventVolume - message: %s, for zone: %s, new volume %s ACTUAL', value, zoneId, this.#volumeState);
    }
    // Communicate status
    if (this.zoneSpeakerService)
      this.zoneSpeakerService.updateCharacteristic(Characteristic.Volume, this.#volumeState);
    if (this.volumeDimmerService)
      this.volumeDimmerService.updateCharacteristic(Characteristic.Brightness, this.#volumeState);
  }

  /// /////////////////////
  // GET AND SET FUNCTIONS
  /// /////////////////////
  setPowerState(powerOn, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    this.#powerState = powerOn;
    callback(null, this.#powerState);
    this.#log.debug('setPowerState - actual mode, power state: %s, switching to ON', this.#powerState);
    rio.powerZone(this.#zoneId, powerOn).then((response, error) => {
      if (error) {
        this.state = false;
        this.#log.error('setPowerState - PWR %s: ERROR - current state: %s', powerOn ? 'ON' : 'OFF', this.#powerState);
      } else {
      }
    });

    // if (this.volume_dimmer) {
    // 	this.#muteState = !(powerOn == 'on');
    // 	this.dimmer.getCharacteristic(Characteristic.On).updateValue((powerOn == 'on'), null, 'power event m_status');
    // }
    //if (this.zoneService)
    //  this.zoneService.updateCharacteristic(Characteristic.Active, this.#powerState);
  }

  getPowerState(callback) {


    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.state);
    this.#log.debug('getPowerState - actual mode, return state: ', this.state);
    rio.getZoneStatus(this.#zoneId).then((response, error) => {
      if (error) {
        this.state = false;
        this.#log.debug('getPowerState - PWR QRY: ERROR - current state: %s', this.state);
      }
    });
    // this.zoneService.getCharacteristic(Characteristic.Active).updateValue(this.state);
  }

  getVolumeState(callback, context) {

    // do the callback immediately, to free homekit
    // have the event later on execute changes
    var prevVolume = this.#volumeState;
    callback(null, this.#volumeState);
    this.#log.debug('getVolumeState - actual mode, return volume: ', this.#volumeState);
    rio.getZoneVolume(this.#zoneId).then((response, error) => {
      if (error) {
        this.#volumeState = prevVolume;
        this.#log.debug('getVolumeState - VOLUME QRY: ERROR - current volume: %s', this.#volumeState);
      }
    });
  }

  setVolumeState(level, callback) {

    var preVolume = this.#volumeState;
    //if (this.volumeDimmerService.getCharacteristic(Characteristic.On).value !== Characteristic.ON)
    //  this.currentVolume = preVolume;
    // Are we mapping volume to 100%?
    if (this.#mapVolume100) {
      const volumeMultiplier = this.#maxVolume / 100;
      const newVolume = volumeMultiplier * level;
      this.#volumeState = Math.round(newVolume);
      this.#log.debug('setVolumeState - actual mode, PERCENT, volume: %s', this.#volumeState);
    } else if (level > this.#maxVolume) {
      // Determine if maxVolume threshold breached, if so set to max.
      this.#volumeState = this.#maxVolume;
      this.#log.debug('setVolumeState - VOLUME LEVEL of: %s exceeds maxVolume: %s. Resetting to max.', level, this.#maxVolume);
    } else {
      // Must be using actual volume number
      this.#volumeState = level;
      this.#log.debug('setVolumeState - actual mode, ACTUAL volume: %s', this.#volumeState);
    }

    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#volumeState);

    //if (this.#volumeState && this.volumeDimmerService.getCharacteristic(Characteristic.On).value === Characteristic.ON)
    rio.volumeZone(this.#zoneId, this.#volumeState).then((response, error) => {
      if (error) {
        this.#volumeState = preVolume;
        this.#log.debug('setVolumeState - VOLUME : ERROR - current volume: %s', this.#volumeState);
      }
    });
  }

  setVolumeRelative(volumeDirection, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#volumeState);
    var prevVolume = this.#volumeState;
    if (volumeDirection === Characteristic.VolumeSelector.INCREMENT) {
      this.#log.debug('setVolumeRelative - VOLUME : level-up');
      rio.volumeZoneUpDown(this.#zoneId, true).then((response, error) => {
        if (error) {
          this.#volumeState = prevVolume;
          this.#log.error('setVolumeRelative - VOLUME : ERROR - current volume: %s', this.#volumeState);
        }
      });
    } else if (volumeDirection === Characteristic.VolumeSelector.DECREMENT) {
      this.#log.debug('setVolumeRelative - VOLUME : level-down');
      rio.volumeZoneUpDown(this.#zoneId, false).then((response, error) => {
        if (error) {
          this.#volumeState = prevVolume;
          this.#log.error('setVolumeRelative - VOLUME : ERROR - current volume: %s', this.#volumeState);
        }
      });
    } else {
      this.#log.error('setVolumeRelative - VOLUME : ERROR - unknown direction sent');
    }
  }
  getMuteState(callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#muteState);
    this.#log.debug('getMuteState - actual mode, return m_state: ', this.#muteState);
    rio.getZoneMute(this.#zoneId).then((response, error) => {
      if (error) {
        this.#muteState = false;
        this.#log.debug('getMuteState - MUTE QRY: ERROR - current m_state: %s', this.#muteState);
      }
    });
  }

  setMuteState(muteOn, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    this.#muteState = muteOn;
    callback(null, this.#muteState);
    this.#log.debug('setMuteState - actual mode, this.#muteState: %s, switching to %s', this.#muteState, muteOn ? 'ON' : 'OFF');
    rio.muteToggleZone(this.#zoneId).then((response, error) => {
      if (error) {
        this.#muteState = false;
        this.#log.error('setMuteState - MUTE %s: ERROR - current this.#muteState: %s', muteOn ? 'ON' : 'OFF', this.#muteState);
      }
    })
  }

  getInputSource(callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    var prevSource = this.#inputState;
    this.#log.debug('getInputState - actual mode, return source: ', this.#inputState);
    callback(null, this.#inputState);
    rio.getZoneSource(this.#zoneId).then((response, error) => {
      if (error) {
        this.#inputState = prevSource;
        this.#log.error('getInputState - INPUT QRY: ERROR - current source: %s', this.#inputState);
      }
    });
    // this.tvService.getCharacteristic(Characteristic.ActiveIdentifier).updateValue(this.#inputState);
  }

  setInputSource(value, callback) {
    var prevSource = this.#inputState;
    this.#inputState = value;
    const input = this.#inputs.find(i => i.id === value.toString());

    this.#log.debug('setInputState - actual mode, ACTUAL input source: %s - %s', this.#inputState, input.name);

    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, this.#inputState);
    rio.selectZoneSource(this.#zoneId, this.#inputState).then((response, error) => {
      if (error) {
        this.#inputState = prevSource;
        this.#log.error('setInputState - INPUT : ERROR - current source:%s - %s', this.#inputState, input.name);
      }
    });
  }

  remoteKeyPress(value, callback) {
    // do the callback immediately, to free homekit
    // have the event later on execute changes
    callback(null, value);
    var button = this.#buttons[value];
    if (button) {
      this.#log.debug('remoteKeyPress - INPUT: pressing key %s', button);
      rio.keypressZone(this.#zoneId, button).then((response, error) => {
        if (error) {
          this.#log.error('remoteKeyPress - INPUT: ERROR pressing button %s', button);
        }
      });
    } else {
      this.#log.error('Remote button %d not supported.', value);
    }
  }

  // identify(callback) {
  //   this.log.info('Identify requested! %s', this.#name);
  //   callback(this.#name || this.model); // success
  // }

  /*
    ////////////////////////
    // ZONE SERVICE FUNCTIONS
    ////////////////////////
  */
  addZoneSources(zoneService) {
    // If input name mappings are provided, use them.

    const sources = this.#inputs.map((input, index) => {
      const hapId = index + 1;
      return this.setupZoneInput(input.name, hapId, zoneService);
    });
    return sources;
  }

  setupZoneInput(name, hapId, zoneService) {
    const input = this.#accessory.getServiceById(Service.InputSource, `input${name.toLowerCase()}`) || this.#accessory.addService(Service.InputSource, `${name}`, `input${name.toLowerCase()}`);
    const inputSourceType = Characteristic.InputSourceType.HDMI;

    input
      .setCharacteristic(Characteristic.Identifier, hapId)
      .setCharacteristic(Characteristic.ConfiguredName, name)
      .setCharacteristic(Characteristic.IsConfigured, Characteristic.IsConfigured.CONFIGURED)
      .setCharacteristic(Characteristic.InputSourceType, inputSourceType);

    input.getCharacteristic(Characteristic.ConfiguredName).setProps({
      perms: [Characteristic.Perms.READ]
    });

    zoneService.addLinkedService(input);
    return input;
  }

  createAccessoryInformationService() {
    this.infoService = this.#accessory.getServiceById(Service.AccessoryInformation) || this.#accessory.addService(Service.AccessoryInformation, `${this.#name} Info`);
    this.infoService
      .updateCharacteristic(Characteristic.Manufacturer, this.avrManufacturer)
      .updateCharacteristic(Characteristic.Model, this.model)
      .updateCharacteristic(Characteristic.SerialNumber, this.avrSerial)
      .updateCharacteristic(Characteristic.FirmwareRevision, PLUGIN_VERSION)
      .updateCharacteristic(Characteristic.Name, this.#name || this.model);

    var configuredName = this.infoService.getCharacteristic(Characteristic.ConfiguredName) || this.infoService.addCharacteristic(Characteristic.ConfiguredName)
    if (configuredName)
      this.infoService
        .updateCharacteristic(Characteristic.ConfiguredName, this.#name || this.model)
    this.#enabledServices.push(this.infoService)
  }

  createVolumeDimmerService(zoneService) {
    this.volumeDimmerService = this.#accessory.getServiceById(Service.Lightbulb, 'volumeDimmerService') || this.#accessory.addService(Service.Lightbulb, `${this.#name} Volume Dimmer`, 'volumeDimmerService');
    var volume = this.volumeDimmerService.getCharacteristic(Characteristic.Brightness) || this.volumeDimmerService.addCharacteristic(Characteristic.Brightness)
    volume
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));
    this.volumeDimmerService
      .getCharacteristic(Characteristic.On)
      // Inverted logic taken from https://github.com/langovoi/homebridge-upnp
      .on('get', callback => {
        this.getMuteState((err, value) => {
          if (err) {
            callback(err);
            return;
          }

          callback(null, !value);
        });
      })
      .on('set', (value, callback) => this.setMuteState(!value, callback));

    zoneService.addLinkedService(this.volumeDimmerService);
    this.#enabledServices.push(this.volumeDimmerService);
  }

  createZoneService() {
    this.#log.debug('Creating TV service for controller %s', this.#name);
    const zoneService = this.#accessory.getServiceById(Service.Television, 'zoneservice') || this.#accessory.addService(Service.Television, `${this.#name}`, 'zoneservice');
    zoneService
      .getCharacteristic(Characteristic.ConfiguredName)
      .setValue(this.#name)
      .setProps({
        perms: [Characteristic.Perms.READ]
      });

    zoneService
      .setCharacteristic(Characteristic.SleepDiscoveryMode, Characteristic.SleepDiscoveryMode.ALWAYS_DISCOVERABLE);

    zoneService
      .getCharacteristic(Characteristic.Active)
      .on('get', this.getPowerState.bind(this))
      .on('set', this.setPowerState.bind(this));

    zoneService
      .getCharacteristic(Characteristic.ActiveIdentifier)
      .on('set', this.setInputSource.bind(this))
      .on('get', this.getInputSource.bind(this));

    zoneService
      .getCharacteristic(Characteristic.RemoteKey)
      .on('set', this.remoteKeyPress.bind(this));

    this.#enabledServices.push(zoneService);
    return zoneService;

  }

  createZoneSpeakerService(zoneService) {
    this.zoneSpeakerService = this.#accessory.getServiceById(Service.TelevisionSpeaker, 'zoneSpeakerService') || this.#accessory.addService(Service.TelevisionSpeaker, `${this.#name} Volume`, 'zoneSpeakerService');
    this.zoneSpeakerService
      .setCharacteristic(Characteristic.Active, Characteristic.Active.ACTIVE)
      .setCharacteristic(Characteristic.VolumeControlType, Characteristic.VolumeControlType.ABSOLUTE);
    this.zoneSpeakerService
      .getCharacteristic(Characteristic.VolumeSelector)
      .on('set', this.setVolumeRelative.bind(this));
    this.zoneSpeakerService
      .getCharacteristic(Characteristic.Mute)
      .on('get', this.getMuteState.bind(this))
      .on('set', this.setMuteState.bind(this));

    var volume = this.zoneSpeakerService.getCharacteristic(Characteristic.Volume) || this.zoneSpeakerService.addCharacteristic(Characteristic.Volume)
    volume
      .on('get', this.getVolumeState.bind(this))
      .on('set', this.setVolumeState.bind(this));

    zoneService.addLinkedService(this.zoneSpeakerService);
    this.#enabledServices.push(this.zoneSpeakerService);
  }
}